/**
 * Data sources used by the build data process.
 */

// Dependencies
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const configUtil = require('../lib/config.js');
require('dotenv').load();

// Get config for output
let { config } = configUtil.getConfig();

// Places for images
const logoPath = path.join(__dirname, '..', 'assets', 'logos');
const ceoPath = path.join(__dirname, '..', 'assets', 'ceos');

// Main export is the config for buildData
module.exports = {
  // Nonprofit list based on finance data available, used for
  // publication
  nonprofits: {
    source: `${
      process.env.DATA_UI_URI
    }/api/v01/company_details/?nonprofit_finance_publishyear=${
      config.data ? config.data.publishYear.data : '2018'
    }&limit=1000&username=${process.env.DATA_UI_USERNAME}&api_key=${
      process.env.DATA_UI_API_KEY
    }`,
    type: 'json',
    postprocess: parseNonprofits,
    local: 'nonprofits.json',
    ttl: 1000 * 60 * 60 * 20
  },
  // List used for mailing
  contactList: {
    source: `${
      process.env.DATA_UI_URI
    }/api/v01/company/?companytype__iregex=charity|foundation|nonprofit|trust&contactemail__iregex=@&state=MN&limit=1000&username=${
      process.env.DATA_UI_USERNAME
    }&api_key=${process.env.DATA_UI_API_KEY}`,
    postprocess: parseContactList,
    ttl: 1000 * 60 * 60 * 20
  }
};

// Parse nonprofits, clean up and remove unnecessary data
function parseNonprofits(input) {
  if (!input || !input.objects) {
    return {};
  }

  let publishYear = config.data ? config.data.publishYear.data : 2018;
  let validYears = [publishYear, publishYear - 1];
  let parsed = input.objects;

  parsed = _.map(parsed, p => {
    delete p.notes;

    // Limit employees
    if (p.employees && p.employees.length) {
      p.employees = _.filter(p.employees, d => {
        return ~validYears.indexOf(d.publishyear);
      });
    }

    // Limit finances
    if (p.nonprofit_finances && p.nonprofit_finances.length) {
      p.nonprofit_finances = _.filter(p.nonprofit_finances, d => {
        return ~validYears.indexOf(d.publishyear);
      });
    }

    // Limit officers
    if (p.officers && p.officers.length) {
      p.officers = _.map(p.officers, o => {
        if (o.nonprofit_salaries && o.nonprofit_salaries.length) {
          o.nonprofit_salaries = _.filter(o.nonprofit_salaries, d => {
            return ~validYears.indexOf(d.publishyear);
          });
        }

        return o;
      });
    }

    return p;
  });

  // Filter any ones we dont have data for
  parsed = _.filter(parsed, p => {
    return (
      p.nonprofit_finances &&
      !!_.find(p.nonprofit_finances, { publishyear: publishYear })
    );
  });

  // Check for images
  parsed = _.map(parsed, p => {
    p.hasLogo = fs.existsSync(path.join(logoPath, `${p.coid}.png`));

    p.officers = _.map(p.officers, o => {
      o.hasImage = fs.existsSync(path.join(ceoPath, `${o.id}.png`));
      return o;
    });

    return p;
  });

  // Category names
  parsed = _.map(parsed, p => {
    _.find(
      {
        'Social services': /social.*/i,
        Healthcare: /health.*care/i,
        Arts: /art/i,
        Education: /education/i,
        Other: /.*/
      },
      (match, cat) => {
        if (p.category && p.category.match(match)) {
          p.category = cat;
          return true;
        }
      }
    );

    return p;
  });

  // Clean up
  parsed = _.map(parsed, p => {
    return pruneEmpty(p);
  });

  // Sort and rank previous year
  parsed = _.sortBy(parsed, p => {
    let f = _.find(p.nonprofit_finances, { publishyear: publishYear - 1 });
    return f ? f.revenue || 0 : 0;
  }).reverse();
  parsed = _.map(parsed, (p, pi) => {
    let f = _.find(p.nonprofit_finances, { publishyear: publishYear - 1 });
    p.rankPrevious = f && f.revenue ? pi + 1 : undefined;
    return p;
  });

  // Sort and rank current year
  parsed = _.sortBy(parsed, p => {
    let f = _.find(p.nonprofit_finances, { publishyear: publishYear });
    return f.revenue || 0;
  }).reverse();
  parsed = _.map(parsed, (p, pi) => {
    p.rank = pi + 1;
    return p;
  });

  // Only 100
  parsed = _.take(parsed, 100);

  return parsed;
}

// Parse contact list
function parseContactList(input) {
  if (input && input.objects) {
    return input.objects;
  }

  return {};
}

// Recursive clean object
function pruneEmpty(obj, removeNotes = true) {
  return (function prune(current) {
    _.forOwn(current, function(value, key) {
      if (
        _.isUndefined(value) ||
        _.isNull(value) ||
        _.isNaN(value) ||
        (!_.isDate(value) && _.isString(value) && _.isEmpty(value)) ||
        (!_.isDate(value) && _.isObject(value) && _.isEmpty(prune(value))) ||
        (removeNotes && key === 'notes')
      ) {
        delete current[key];
      }
    });
    // remove any leftover undefined values from the delete
    // operation on an array
    if (_.isArray(current)) _.pull(current, undefined);

    return current;
  })(_.cloneDeep(obj));
  // Do not modify the original object, create a clone instead
}
