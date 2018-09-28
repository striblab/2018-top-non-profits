/**
 * Data sources used by the build data process.
 */

// Dependencies
const configUtil = require('../lib/config.js');
require('dotenv').load();

// Get config for output
let { config } = configUtil.getConfig();

// Main export is the config for buildData
module.exports = {
  // Nonprofit list based on finance data available, used for
  // publication
  nonprofits: {
    source: `${
      process.env.DATA_UI_URI
    }/api/v01/company_details/?nonprofit_finance_publishyear=${
      config.data ? config.data.publishYear.data : '2017'
    }&limit=100&username=${process.env.DATA_UI_USERNAME}&api_key=${
      process.env.DATA_UI_API_KEY
    }`,
    type: 'json',
    postprocess: parseNonprofits,
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

// Parse nonprofits
function parseNonprofits(input) {
  if (input && input.objects) {
    return input.objects;
  }

  return {};
}

// Parse contact list
function parseContactList(input) {
  if (input && input.objects) {
    return input.objects;
  }

  return {};
}
