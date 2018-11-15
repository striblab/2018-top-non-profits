/**
 * Main JS file for project.
 */

// Define globals that are added through the js.globals in
// the config.json file, here, mostly so linting won't get triggered
// and its a good queue of what is available:
/* global $ */

// Dependencies
import utils from './utils.js';
import Content from '../templates/_index-content.svelte.html';
import nonprofits from '../assets/data/nonprofits.json';

// Mark page with note about development or staging
utils.environmentNoting();

// Hacky way to get the share parts to show up
let $share = $('.share-placeholder').size()
  ? $('.share-placeholder')
    .children()
    .detach()
  : undefined;
let attachShare = !$share
  ? undefined
  : () => {
    $('.share-placeholder').append($share);
  };

// Svelte template hook-up
const app = new Content({
  target: document.querySelector('.article-lcd-body-content'),
  data: {
    nonprofits,
    // Would be nice to be able to pull this in from config.json
    publishYear: 2017,
    attachShare
  }
});
window.__app = app;
