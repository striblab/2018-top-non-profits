/**
 * Create contact list
 */

// Dependencies
const fs = require('fs-extra');
const path = require('path');
const queryString = require('query-string');
const _ = require('lodash');
const { parseFullName } = require('parse-full-name');
const { format } = require('date-fns');
const csv = require('d3-dsv').dsvFormat(',');
let { getData } = require('../lib/gulp-html.js');
let shorten = require('../lib/url-shorten.js');

// Output
const outputDir = path.join(__dirname, 'build');
const outputPath = path.join(
  outputDir,
  `${format(new Date(), 'YYYY')}-non-profit-contact-list-${format(
    new Date(),
    'YYYY-MM-dd'
  )}.csv`
);

// Main function
async function main() {
  let sources = await getData();

  // Make sure we don't have any that are dropped
  let list = _.filter(sources.contactList, c => {
    return !c.companytype.match(/drop/i);
  });

  // Parse list
  list = _.map(list, c => {
    // Parse name
    let name = parseFullName(c.contact);
    if (name.error && name.error.length) {
      console.error('Name parse error: ' + name.error);
    }
    delete name.error;

    // Put together list data
    return _.extend(name, {
      contact: c.contact,
      phone: c.contactphone,
      email: c.contactemail,
      orgID: c.coid,
      orgIRSNo: c.irsno,
      orgName: c.name,
      orgType: c.companytype,
      orgAddressFull: _.filter([
        c.address1 + (c.address2 ? ' ' + c.address2 : ''),
        c.city,
        c.state + ' ' + c.zip
      ]).join(', '),
      orgWebsite: c.www,
      orgDescription: c.sescription,
      orgShortDescription: c.shortdesc
    });
  });

  // Some checks
  _.each(list, c => {
    if (!c.email) {
      console.error(`${c.orgID}: ${c.orgName} does not have a contact email.`);
    }
    if (!c.contact) {
      console.error(`${c.orgID}: ${c.orgName} does not have a contact person.`);
    }
  });

  // Make link
  for (let c of list) {
    // If you copy the form from the previous year, these IDs stay the same.
    // /viewform?usp=pp_url&entry.463322031=np-SURVEY-18&entry.311536750=orgID&entry.646452484=orgName&entry.1440568490=orgIRSNo&entry.1326466709=orgAddressFull&entry.1296712022=orgWebsite&entry.947743576=orgShortDescription&entry.616715940=orgDescription&entry.588271044=contact&entry.1899543844=email@email.c&entry.1414459639=555555555
    c.surveyURL = `${
      process.env.SURVEY_URL
    }viewform?usp=pp_url&${queryString.stringify({
      'entry.463322031': process.env.SURVEY_PASS,
      'entry.311536750': c.orgID,
      'entry.646452484': c.orgName,
      'entry.1440568490': c.orgIRSNo,
      'entry.1326466709': c.orgAddressFull,
      'entry.1296712022': c.orgWebsite,
      'entry.947743576': c.orgShortDescription,
      'entry.616715940': c.orgDescription,
      'entry.588271044': c.contact,
      'entry.1899543844': c.email,
      'entry.1414459639': c.phone
    })}`;

    // Mailchimp only allows for 255 chracters (255 bytes) so we have to shorten
    // the URL
    // https://kb.mailchimc.com/lists/growth/format-guidelines-for-your-import-file
    c.surveyURLShort = await shorten(c.surveyURL);
  }

  // Output CSV
  fs.mkdirpSync(outputDir);
  fs.writeFileSync(outputPath, csv.format(list));
  console.error(`${list.length} contacts written to CSV at: \n${outputPath}`);
}

// Run main
main();
