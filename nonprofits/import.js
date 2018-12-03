/**
 * Import data into database.
 *
 * Requires:
 *   CSV export of the survey responses.
 *   Env var: MYSQL_HOST
 *   Env var: MYSQL_USER
 *   Env var: MYSQL_DATABASE
 *   Env var: MYSQL_PASS (optional)
 */

// Dependencies
const fs = require('fs-extra');
const path = require('path');
const util = require('util');
const csv = require('d3-dsv').dsvFormat(',');
const _ = require('lodash');
const mysql = require('mysql');
const readlineSync = require('readline-sync');
const { parseLocation: parseAddress } = require('parse-address');
const moment = require('moment');
const argv = require('yargs').argv;
require('dotenv').load();

// Settings
const listYear = new Date().getFullYear();
const fileDate = moment().format('YYYYMMDD');
const sqlDate = moment().format('YYYY-MM-DD');
const defaultFiscalYearEnd = `${listYear - 1}-12-31`;

// Path to backups when we pull data
const backupPath = path.join(__dirname, 'build', 'backups');
fs.mkdirpSync(backupPath);

// Make sure we have credentials
if (
  !process.env.MYSQL_HOST ||
  !process.env.MYSQL_USER ||
  !process.env.MYSQL_DATABASE
) {
  throw new Error(
    'Make sure the following environment variables are set: MYSQL_USER, MYSQL_HOST, MYSQL_DATABASE || MYSQL_PASS is optional.'
  );
}

// Check for csv
if (!argv.responses) {
  throw new Error('--responses option not provided.');
}

// Check csv exists
if (!fs.existsSync(argv.responses)) {
  throw new Error(`Unable to find responses file: ${argv.responses}`);
}

// Try to read
let originalResponses;
try {
  originalResponses = csv.parse(fs.readFileSync(argv.responses, 'utf-8'));
}
catch (e) {
  console.error(e);
  throw new Error(`Unable to read responses file: ${argv.responses}`);
}

// Connect to database
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS || '',
  database: process.env.MYSQL_DATABASE
});
db.connect();
// Promisify query
db.queryP = util.promisify(db.query).bind(db);

// Main function
async function main() {
  // Get current data
  let current = await currentData();

  // Get responses
  let responses = _.cloneDeep(originalResponses);

  // check we have data
  if (!responses || !responses.length) {
    throw new Error(`No data found in responses: ${argv.responses}`);
  }

  // Clean up
  responses = _.filter(responses, r => {
    return (
      r['Star Tribune ID'] &&
      r['Organization Name'] &&
      !r['Organization Name'].match(/(^|\s)test(\s|$)/i)
    );
  });

  // Start transaction
  await db.queryP('START TRANSACTION');

  // Go through each response
  for (let r of responses) {
    try {
      await importResponse(r, current);
    }
    catch (e) {
      console.error(r);
      console.error(e);
      await db.queryP('ROLLBACK');
      console.error('Error importing, rolling back changes.');
      process.exit(1);
    }
  }

  // End transcation
  if (argv.commit) {
    let sure = readlineSync.question(
      'Are you sure you want to commit these changes? (y/n) '
    );
    if (sure && sure.trim().toLowerCase() === 'y') {
      console.error('Committing data.');
      await db.queryP('COMMIT');
    }
    else {
      console.error('Rolling back.');
      await db.queryP('ROLLBACK');
    }
  }
  else {
    console.error('Rolling back, use the --commit option to commit data.');
    await db.queryP('ROLLBACK');
  }

  // Disconnect
  db.end();
}

// Import a response
async function importResponse(r, current) {
  // Make sure we have an existing COID
  let companyLookup = _.find(current.companies, {
    COID: r['Star Tribune ID']
  });
  if (!companyLookup) {
    throw new Error('Unable to find COID in table.');
  }

  // Company
  let company = {
    COID: r['Star Tribune ID'],
    IRSNo: r['Federal employee ID number'],
    Added: companyLookup.Added ? companyLookup.Added : sqlDate,
    Company: r['Organization Name'],
    WWW: r['Website'],
    Contact: r['Contact person\'s name'],
    ContactPhone: r['Contact person\'s phone'],
    ContactEmail: r['Contact person\'s email'],
    Description: r['Organization long description'],
    ShortDesc: r['Organization short description'],
    Category: r['What category does your organization fit best?']
  };

  // Address
  let p = parseAddress(r['Address']);
  if (r['Address'] && p && p.street) {
    (company.Address1 = _.filter([
      p.number,
      p.prefix,
      p.street,
      p.type,
      p.suffix
    ]).join(' ')),
    (company.Address2 = p.sec_unit_type
      ? _.filter([p.sec_unit_type, p.sec_unit_num]).join(' ')
      : undefined);
    company.City = p.city;
    company.State = p.state;
    company.Zip = p.zip;
  }

  // Import company
  let newCompany = await upsert('Companies', company, !!companyLookup, 'COID');

  // Employees
  let employeesLookup = _.find(current.employees, e => {
    return (
      e.COID === newCompany.COID && e.PublishYear && e.PublishYear === listYear
    );
  });
  let employees = {
    COID: newCompany.COID,
    Added: sqlDate,
    PublishYear: listYear,
    Total: parseNumber(r['Total number of employees'])
  };
  if (employeesLookup) {
    employees.ID = employeesLookup.ID;
    employees.Added = employeesLookup.Added
      ? employeesLookup.Added
      : employees.Added;
  }

  // Import employees
  await upsert('Employees', employees, !!employeesLookup);

  // Officer, check for a last name
  let newOfficer;
  if (!r['Last Name']) {
    console.error(
      `No last name provided for an officer: [${newCompany.COID}] ${
        newCompany.Company
      }`
    );
  }
  else {
    let officerLookup = _.find(current.officers, e => {
      return e.COID === newCompany.COID && e.Last === r['Last Name'];
    });
    let officer = {
      COID: newCompany.COID,
      First: r['First Name'],
      Last: r['Last Name'],
      Title: r['Title']
    };
    if (officerLookup) {
      officer.ID = officerLookup.ID;
    }

    newOfficer = await upsert('Officers', officer, !!officerLookup);
  }

  // NP Officer salary.  Make sure we have an officer and data
  if (!newOfficer || (!r['Salary'] && !r['Total compensation'])) {
    console.error(
      `No officer or salary/compensation provided for officer salary: [${
        newCompany.COID
      }] ${newCompany.Company}`
    );
  }
  else {
    let salaryLookup = _.find(current.salaries, e => {
      return (
        newOfficer.ID === e.OfficerID &&
        e.PublishYear &&
        e.PublishYear === listYear
      );
    });
    let salary = {
      OfficerID: newOfficer.ID,
      Added: sqlDate,
      PublishYear: listYear,
      CEO: true,
      FiscalYearEnd: inputToSQLDate(r['Date of these data']),
      Salary: parseNumber(r['Salary']),
      Bonus: parseNumber(r['Bonus']),
      Other: parseNumber(r['Other compensation']),
      Deferred: parseNumber(r['Deferred compensation']),
      Benefit: parseNumber(r['Value of benefits']),
      Total: parseNumber(r['Total compensation']),
      Title: newOfficer.Title,
      Footnotes: r['Compensation footnotes']
    };
    if (salaryLookup) {
      salary.ID = salaryLookup.ID;
      salary.Added = salaryLookup.Added ? salaryLookup.Added : salary.Added;
    }

    await upsert('NonProfit_Salaries', salary, !!salaryLookup);
  }

  // Finances
  let financesLookup = _.find(current.finances, e => {
    return e.COID === newCompany.COID && e.PublishYear === listYear;
  });
  let finances = {
    COID: newCompany.COID,
    Added: sqlDate,
    PublishYear: listYear,
    FiscalYearEnd:
      inputToSQLDate(r['Date of these data']) || defaultFiscalYearEnd,
    AnnualReportDate:
      inputToSQLDate(r['Date of these data']) || defaultFiscalYearEnd,
    Source: r['Source of these data'],
    ContribGrants: parseNumber(r['Total contributions and grants']),
    Revenue: parseNumber(r['Total revenue']),
    Expenses: parseNumber(r['Total expenses']),
    Excess: parseNumber(r['Excess - revenue less expenses']),
    ProgramServiceRevenue: parseNumber(r['Program service revenue']),

    ProgramServiceExpense: parseNumber(r['Program services expenses']),
    ManagementGeneralExpenses: parseNumber(
      r['Management and general expenses']
    ),
    FundraisingExpenses: parseNumber(r['Fundraising expenses']),
    InvestGainsLosses: parseNumber(
      r['Net unrealized gains/losses on investments']
    ),
    EOYBalance: parseNumber(r['Net assets or fund balances at end of year']),
    InputSource: 'Automatically imported from ' + listYear + ' survey.',
    Footnotes:
      r[
        'Please provide any footnote or additional information regarding these financial numbers that you think is important for the Star Tribune to know.'
      ]
  };
  if (financesLookup) {
    finances.ID = financesLookup.ID;
    finances.Added = financesLookup.Added
      ? financesLookup.Added
      : finances.Added;
  }

  await upsert('NonProfit_Finances', finances, !!financesLookup);
}

// Go
main();

// Update or insert
async function upsert(table, data, isUpdate, idField = 'ID') {
  // Modified data
  data.modified_date = data.modified_date || new Date();
  if (!isUpdate) {
    data.created_date = new Date();
  }

  // Create query
  let query = mysql.format(
    `INSERT INTO ${table} (${_.map(data, (v, k) => k).join(
      ', '
    )}) VALUES (${_.map(data, () => '?').join(
      ', '
    )}) ON DUPLICATE KEY UPDATE ${_.map(data, (v, k) => {
      return k + ' = ?';
    }).join(', ')}`,
    _.map(data).concat(_.map(data))
  );

  // Run query
  try {
    await db.queryP(query);
  }
  catch (e) {
    console.error(query);
    throw e;
  }

  // Get new record, a littl ehacky
  let lastId = data[idField];
  if (!isUpdate) {
    lastId = await db.queryP('SELECT LAST_INSERT_ID() AS last');
    lastId = lastId[0].last;
  }
  return (await db.queryP(
    mysql.format(`SELECT * FROM ${table} WHERE ${idField} = ?`, [lastId])
  ))[0];
}

// Parse number
function parseNumber(input, type = 'int') {
  if (_.isNumber(input)) {
    return input;
  }
  else if (!_.isString(input)) {
    return undefined;
  }

  input = input.replace(/[^0-9-.]/g, '').trim();
  let parsed = type === 'int' ? parseInt(input, 10) : parseFloat(input);
  return _.isNaN(parsed) ? undefined : parsed;
}

// Parse MM/DD/YYYY date to YYYY-MM-DD
function inputToSQLDate(input) {
  if (input && moment(input, 'MM/DD/YYYY').isValid()) {
    return moment(input, 'MM/DD/YYYY').format('YYYY-MM-DD');
  }
}

// Get all current data
async function currentData() {
  let data = {};
  data.companies = await db.queryP('SELECT * FROM Companies');
  data.officers = await db.queryP('SELECT * FROM Officers');
  data.salaries = await db.queryP('SELECT * FROM NonProfit_Salaries');
  data.finances = await db.queryP('SELECT * FROM NonProfit_Finances');
  data.employees = await db.queryP('SELECT * FROM Employees');

  // Save local copy
  _.each(data, (d, set) => {
    fs.writeFileSync(
      path.join(
        backupPath,
        'non-profit-backup-' + fileDate + '-' + set + '.json'
      ),
      JSON.stringify(d)
    );
  });

  return data;
}
