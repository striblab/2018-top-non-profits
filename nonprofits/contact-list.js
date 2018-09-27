/**
 * Create contact list
 */

// Dependencies
const queryString = require('query-string');
const _ = require('lodash');
const parseName = require('parse-full-name').parseFullName;
let { getData } = require('../lib/gulp-html.js');

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
    let name = parseName(c.contact);
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

    // // Mailchimp only allows for 255 chracters (255 bytes)
    // // https://kb.mailchimc.com/lists/growth/format-guidelines-for-your-import-file
    // if (cache.urls && cache.urls[c.surveyURL]) {
    //   c.surveyURLShort = cache.urls[c.surveyURL];
    //   return done(null, p);
    // }

    // shortener.shorten(c.surveyURL, (error, short) => {
    //   if (error) {
    //     return done(error);
    //   }

    //   c.surveyURLShort = short;
    //   cache.urls = cache.urls || {};
    //   cache.urls[c.surveyURL] = short;
    //   writeCache();
    //   done(null, p);
    // });
  }

  console.log(list);
}

// Run main
main();
