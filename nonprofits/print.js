/**
 * Make list for print
 */

// Dependencies
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const { format } = require('date-fns');
const csv = require('d3-dsv').dsvFormat(',');
let { getData } = require('../lib/gulp-html.js');

// Output
const outputDir = path.join(__dirname, 'build');
const outputPath = path.join(
  outputDir,
  `${format(new Date(), 'YYYY')}-non-profit-print-list-${format(
    new Date(),
    'YYYY-MM-dd'
  )}.csv`
);

// Main function
async function main() {
  let { nonprofits, publishYear } = await getData();

  // Convert to subset
  let subset = _.map(nonprofits, n => {
    let currentFinances = _.find(n.nonprofit_finances, {
      publishyear: publishYear
    });
    let pastFinances = _.find(n.nonprofit_finances, {
      publishyear: publishYear - 1
    });
    let ceoSalary;
    let ceo = _.find(n.officers, o => {
      ceoSalary = _.find(o.nonprofit_salaries, {
        publishyear: publishYear,
        ceo: 1
      });
      return ceoSalary;
    });

    let s = {
      category: n.category,
      rank: n.rank,
      company: n.name,
      revenue: currentFinances.revenue,
      previousRevenue: pastFinances ? pastFinances.revenue : undefined,
      revenueChangePercent: pastFinances
        ? Math.round(
          ((currentFinances.revenue - pastFinances.revenue) /
              pastFinances.revenue) *
              10000
        ) / 100
        : undefined,
      expenses: currentFinances.expenses,
      grantsAsPercentOfRevenue: currentFinances.contribgrants
        ? Math.round(
          (currentFinances.contribgrants / currentFinances.revenue) * 10000
        ) / 100
        : undefined,
      excess: currentFinances.excess,
      fiscalYearEnd: currentFinances.fiscalyearend,
      topOfficer: ceo
        ? _.filter([
          ceo.salut && ceo.salut.indexOf('M') !== 0 ? ceo.salut : '',
          ceo.first,
          ceo.last,
          ceo.lineage ? `, ${ceo.lineage}` : ''
        ])
          .join(' ')
          .replace(/ ,/g, ',')
        : undefined,
      compensation: ceo && ceoSalary ? ceoSalary.total : undefined,
      financeFootnotes: currentFinances.footnotes,
      financeDate: currentFinances.fiscalyearend,
      financeSource: currentFinances.source,
      ceoSalaryFootnotes: ceoSalary ? ceoSalary.footnotes : undefined,
      companyFootnotes: n.footnotes
    };
    return s;
  });

  // Write out all
  fs.writeFileSync(
    outputPath.replace('-list-', '-list-all-'),
    csv.format(subset)
  );
  console.error(
    `Wrote output to: ${outputPath.replace('-list-', '-list-all-')}`
  );

  // By category
  fs.writeFileSync(
    outputPath.replace('-list-', '-list-healthcare-'),
    csv.format(_.filter(subset, s => s.category.match(/healthcare/i)))
  );
  fs.writeFileSync(
    outputPath.replace('-list-', '-list-education-'),
    csv.format(_.filter(subset, s => s.category.match(/education/i)))
  );
  fs.writeFileSync(
    outputPath.replace('-list-', '-list-social-'),
    csv.format(_.filter(subset, s => s.category.match(/social/i)))
  );
  fs.writeFileSync(
    outputPath.replace('-list-', '-list-arts-other-'),
    csv.format(_.filter(subset, s => s.category.match(/arts|other/i)))
  );
}

main();
