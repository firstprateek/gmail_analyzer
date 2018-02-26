const bluebird = require('bluebird');
const request = bluebird.promisifyAll(require('request'), { multiArgs: true });
const cheerio = require('cheerio');
const graph = require('fbgraph');
const LastFmNode = require('lastfm').LastFmNode;
const tumblr = require('tumblr.js');
const GitHub = require('github');
const Twit = require('twit');
const stripe = require('stripe')(process.env.STRIPE_SKEY);
const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const Linkedin = require('node-linkedin')(process.env.LINKEDIN_ID, process.env.LINKEDIN_SECRET, process.env.LINKEDIN_CALLBACK_URL);
const clockwork = require('clockwork')({ key: process.env.CLOCKWORK_KEY });
const paypal = require('paypal-rest-sdk');
const lob = require('lob')(process.env.LOB_KEY);
const ig = bluebird.promisifyAll(require('instagram-node').instagram());
const foursquare = require('node-foursquare')({
  secrets: {
    clientId: process.env.FOURSQUARE_ID,
    clientSecret: process.env.FOURSQUARE_SECRET,
    redirectUrl: process.env.FOURSQUARE_REDIRECT_URL
  }
});

foursquare.Venues = bluebird.promisifyAll(foursquare.Venues);
foursquare.Users = bluebird.promisifyAll(foursquare.Users);

const User = require('../models/User');
const geoip = require('geoip-lite');
/**
 * GET /api
 * List of API examples.
 */
exports.getApi = (req, res) => {
  res.render('api/index', {
    title: 'API Examples'
  });
};

/**
 * GET /api/foursquare
 * Foursquare API example.
 */
exports.getFoursquare = (req, res, next) => {
  const token = req.user.tokens.find(token => token.kind === 'foursquare');
  Promise.all([
    foursquare.Venues.getTrendingAsync('40.7222756', '-74.0022724', { limit: 50 }, token.accessToken),
    foursquare.Venues.getVenueAsync('49da74aef964a5208b5e1fe3', token.accessToken),
    foursquare.Users.getCheckinsAsync('self', null, token.accessToken)
  ])
  .then(([trendingVenues, venueDetail, userCheckins]) => {
    res.render('api/foursquare', {
      title: 'Foursquare API',
      trendingVenues,
      venueDetail,
      userCheckins
    });
  })
  .catch(next);
};

/**
 * GET /api/tumblr
 * Tumblr API example.
 */
exports.getTumblr = (req, res, next) => {
  const token = req.user.tokens.find(token => token.kind === 'tumblr');
  const client = tumblr.createClient({
    consumer_key: process.env.TUMBLR_KEY,
    consumer_secret: process.env.TUMBLR_SECRET,
    token: token.accessToken,
    token_secret: token.tokenSecret
  });
  client.posts('mmosdotcom.tumblr.com', { type: 'photo' }, (err, data) => {
    if (err) { return next(err); }
    res.render('api/tumblr', {
      title: 'Tumblr API',
      blog: data.blog,
      photoset: data.posts[0].photos
    });
  });
};

/**
 * GET /api/scraping
 * Web scraping example using Cheerio library.
 */
exports.getScraping = (req, res, next) => {
  request.get('https://news.ycombinator.com/', (err, request, body) => {
    if (err) { return next(err); }
    const $ = cheerio.load(body);
    const links = [];
    $('.title a[href^="http"], a[href^="https"]').each((index, element) => {
      links.push($(element));
    });
    res.render('api/scraping', {
      title: 'Web Scraping',
      links
    });
  });
};

/**
 * GET /api/github
 * GitHub API Example.
 */
exports.getGithub = (req, res, next) => {
  const github = new GitHub();
  github.repos.get({ owner: 'sahat', repo: 'hackathon-starter' }, (err, repo) => {
    if (err) { return next(err); }
    res.render('api/github', {
      title: 'GitHub API',
      repo
    });
  });
};

/**
 * GET /api/aviary
 * Aviary image processing example.
 */
exports.getAviary = (req, res) => {
  res.render('api/aviary', {
    title: 'Aviary API'
  });
};

/**
 * GET /api/nyt
 * New York Times API example.
 */
exports.getNewYorkTimes = (req, res, next) => {
  const query = {
    'list-name': 'young-adult',
    'api-key': process.env.NYT_KEY
  };
  request.get({ url: 'http://api.nytimes.com/svc/books/v2/lists', qs: query }, (err, request, body) => {
    if (err) { return next(err); }
    if (request.statusCode === 403) {
      return next(new Error('Invalid New York Times API Key'));
    }
    const books = JSON.parse(body).results;
    res.render('api/nyt', {
      title: 'New York Times API',
      books
    });
  });
};

/**
 * GET /api/lastfm
 * Last.fm API example.
 */
exports.getLastfm = (req, res, next) => {
  const lastfm = new LastFmNode({
    api_key: process.env.LASTFM_KEY,
    secret: process.env.LASTFM_SECRET
  });
  const artistInfo = () =>
    new Promise((resolve, reject) => {
      lastfm.request('artist.getInfo', {
        artist: 'Roniit',
        handlers: {
          success: resolve,
          error: reject
        }
      });
    });
  const artistTopTracks = () =>
    new Promise((resolve, reject) => {
      lastfm.request('artist.getTopTracks', {
        artist: 'Roniit',
        handlers: {
          success: (data) => {
            resolve(data.toptracks.track.slice(0, 10));
          },
          error: reject
        }
      });
    });
  const artistTopAlbums = () =>
      new Promise((resolve, reject) => {
        lastfm.request('artist.getTopAlbums', {
          artist: 'Roniit',
          handlers: {
            success: (data) => {
              resolve(data.topalbums.album.slice(0, 3));
            },
            error: reject
          }
        });
      });
  Promise.all([
    artistInfo(),
    artistTopTracks(),
    artistTopAlbums()
  ])
  .then(([artistInfo, artistTopAlbums, artistTopTracks]) => {
    const artist = {
      name: artistInfo.artist.name,
      image: artistInfo.artist.image.slice(-1)[0]['#text'],
      tags: artistInfo.artist.tags.tag,
      bio: artistInfo.artist.bio.summary,
      stats: artistInfo.artist.stats,
      similar: artistInfo.artist.similar.artist,
      topAlbums: artistTopAlbums,
      topTracks: artistTopTracks
    };
    res.render('api/lastfm', {
      title: 'Last.fm API',
      artist
    });
  })
  .catch(next);
};

/**
 * GET /api/twitter
 * Twitter API example.
 */
exports.getTwitter = (req, res, next) => {
  const token = req.user.tokens.find(token => token.kind === 'twitter');
  const T = new Twit({
    consumer_key: process.env.TWITTER_KEY,
    consumer_secret: process.env.TWITTER_SECRET,
    access_token: token.accessToken,
    access_token_secret: token.tokenSecret
  });
  T.get('search/tweets', { q: 'nodejs since:2013-01-01', geocode: '40.71448,-74.00598,5mi', count: 10 }, (err, reply) => {
    if (err) { return next(err); }
    res.render('api/twitter', {
      title: 'Twitter API',
      tweets: reply.statuses
    });
  });
};

/**
 * POST /api/twitter
 * Post a tweet.
 */
exports.postTwitter = (req, res, next) => {
  req.assert('tweet', 'Tweet cannot be empty').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/api/twitter');
  }

  const token = req.user.tokens.find(token => token.kind === 'twitter');
  const T = new Twit({
    consumer_key: process.env.TWITTER_KEY,
    consumer_secret: process.env.TWITTER_SECRET,
    access_token: token.accessToken,
    access_token_secret: token.tokenSecret
  });
  T.post('statuses/update', { status: req.body.tweet }, (err) => {
    if (err) { return next(err); }
    req.flash('success', { msg: 'Your tweet has been posted.' });
    res.redirect('/api/twitter');
  });
};

/**
 * GET /api/steam
 * Steam API example.
 */
exports.getSteam = (req, res, next) => {
  const steamId = '76561197982488301';
  const params = { l: 'english', steamid: steamId, key: process.env.STEAM_KEY };
  const playerAchievements = () => {
    params.appid = '49520';
    return request.getAsync({ url: 'http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/', qs: params, json: true })
      .then(([request, body]) => {
        if (request.statusCode === 401) {
          throw new Error('Invalid Steam API Key');
        }
        return body;
      });
  };
  const playerSummaries = () => {
    params.steamids = steamId;
    return request.getAsync({ url: 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/', qs: params, json: true })
      .then(([request, body]) => {
        if (request.statusCode === 401) {
          throw Error('Missing or Invalid Steam API Key');
        }
        return body;
      });
  };
  const ownedGames = () => {
    params.include_appinfo = 1;
    params.include_played_free_games = 1;
    return request.getAsync({ url: 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/', qs: params, json: true })
      .then(([request, body]) => {
        if (request.statusCode === 401) {
          throw new Error('Missing or Invalid Steam API Key');
        }
        return body;
      });
  };
  Promise.all([
    playerAchievements(),
    playerSummaries(),
    ownedGames()
  ])
  .then(([playerAchievements, playerSummaries, ownedGames]) => {
    res.render('api/steam', {
      title: 'Steam Web API',
      ownedGames: ownedGames.response.games,
      playerAchievemments: playerAchievements.playerstats,
      playerSummary: playerSummaries.response.players[0]
    });
  })
  .catch(next);
};

/**
 * GET /api/stripe
 * Stripe API example.
 */
exports.getStripe = (req, res) => {
  res.render('api/stripe', {
    title: 'Stripe API',
    publishableKey: process.env.STRIPE_PKEY
  });
};

/**
 * POST /api/stripe
 * Make a payment.
 */
exports.postStripe = (req, res) => {
  const stripeToken = req.body.stripeToken;
  const stripeEmail = req.body.stripeEmail;
  stripe.charges.create({
    amount: 395,
    currency: 'usd',
    source: stripeToken,
    description: stripeEmail
  }, (err) => {
    if (err && err.type === 'StripeCardError') {
      req.flash('errors', { msg: 'Your card has been declined.' });
      return res.redirect('/api/stripe');
    }
    req.flash('success', { msg: 'Your card has been successfully charged.' });
    res.redirect('/api/stripe');
  });
};

/**
 * GET /api/twilio
 * Twilio API example.
 */
exports.getTwilio = (req, res) => {
  res.render('api/twilio', {
    title: 'Twilio API'
  });
};

/**
 * POST /api/twilio
 * Send a text message using Twilio.
 */
exports.postTwilio = (req, res, next) => {
  req.assert('number', 'Phone number is required.').notEmpty();
  req.assert('message', 'Message cannot be blank.').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/api/twilio');
  }

  const message = {
    to: req.body.number,
    from: '+13472235148',
    body: req.body.message
  };
  twilio.sendMessage(message, (err, responseData) => {
    if (err) { return next(err.message); }
    req.flash('success', { msg: `Text sent to ${responseData.to}.` });
    res.redirect('/api/twilio');
  });
};

/**
 * GET /api/clockwork
 * Clockwork SMS API example.
 */
exports.getClockwork = (req, res) => {
  res.render('api/clockwork', {
    title: 'Clockwork SMS API'
  });
};

/**
 * POST /api/clockwork
 * Send a text message using Clockwork SMS
 */
exports.postClockwork = (req, res, next) => {
  const message = {
    To: req.body.telephone,
    From: 'Hackathon',
    Content: 'Hello from the Hackathon Starter'
  };
  clockwork.sendSms(message, (err, responseData) => {
    if (err) { return next(err.errDesc); }
    req.flash('success', { msg: `Text sent to ${responseData.responses[0].to}` });
    res.redirect('/api/clockwork');
  });
};

/**
 * GET /api/linkedin
 * LinkedIn API example.
 */
exports.getLinkedin = (req, res, next) => {
  const token = req.user.tokens.find(token => token.kind === 'linkedin');
  const linkedin = Linkedin.init(token.accessToken);
  linkedin.people.me((err, $in) => {
    if (err) { return next(err); }
    res.render('api/linkedin', {
      title: 'LinkedIn API',
      profile: $in
    });
  });
};

/**
 * GET /api/instagram
 * Instagram API example.
 */
exports.getInstagram = (req, res, next) => {
  const token = req.user.tokens.find(token => token.kind === 'instagram');
  ig.use({ client_id: process.env.INSTAGRAM_ID, client_secret: process.env.INSTAGRAM_SECRET });
  ig.use({ access_token: token.accessToken });
  Promise.all([
    ig.user_searchAsync('richellemead'),
    ig.userAsync('175948269'),
    ig.media_popularAsync(),
    ig.user_self_media_recentAsync()
  ])
  .then(([searchByUsername, searchByUserId, popularImages, myRecentMedia]) => {
    res.render('api/instagram', {
      title: 'Instagram API',
      usernames: searchByUsername,
      userById: searchByUserId,
      popularImages,
      myRecentMedia
    });
  })
  .catch(next);
};

/**
 * GET /api/paypal
 * PayPal SDK example.
 */
exports.getPayPal = (req, res, next) => {
  paypal.configure({
    mode: 'sandbox',
    client_id: process.env.PAYPAL_ID,
    client_secret: process.env.PAYPAL_SECRET
  });

  const paymentDetails = {
    intent: 'sale',
    payer: {
      payment_method: 'paypal'
    },
    redirect_urls: {
      return_url: process.env.PAYPAL_RETURN_URL,
      cancel_url: process.env.PAYPAL_CANCEL_URL
    },
    transactions: [{
      description: 'Hackathon Starter',
      amount: {
        currency: 'USD',
        total: '1.99'
      }
    }]
  };

  paypal.payment.create(paymentDetails, (err, payment) => {
    if (err) { return next(err); }
    req.session.paymentId = payment.id;
    const links = payment.links;
    for (let i = 0; i < links.length; i++) {
      if (links[i].rel === 'approval_url') {
        res.render('api/paypal', {
          approvalUrl: links[i].href
        });
      }
    }
  });
};

/**
 * GET /api/paypal/success
 * PayPal SDK example.
 */
exports.getPayPalSuccess = (req, res) => {
  const paymentId = req.session.paymentId;
  const paymentDetails = { payer_id: req.query.PayerID };
  paypal.payment.execute(paymentId, paymentDetails, (err) => {
    res.render('api/paypal', {
      result: true,
      success: !err
    });
  });
};

/**
 * GET /api/paypal/cancel
 * PayPal SDK example.
 */
exports.getPayPalCancel = (req, res) => {
  req.session.paymentId = null;
  res.render('api/paypal', {
    result: true,
    canceled: true
  });
};

/**
 * GET /api/lob
 * Lob API example.
 */
exports.getLob = (req, res, next) => {
  lob.routes.list({ zip_codes: ['10007'] }, (err, routes) => {
    if (err) { return next(err); }
    res.render('api/lob', {
      title: 'Lob API',
      routes: routes.data[0].routes
    });
  });
};

/**
 * GET /api/upload
 * File Upload API example.
 */

exports.getFileUpload = (req, res) => {
  res.render('api/upload', {
    title: 'File Upload'
  });
};

exports.postFileUpload = (req, res) => {
  req.flash('success', { msg: 'File was uploaded successfully.' });
  res.redirect('/api/upload');
};

/**
 * GET /api/pinterest
 * Pinterest API example.
 */
exports.getPinterest = (req, res, next) => {
  const token = req.user.tokens.find(token => token.kind === 'pinterest');
  request.get({ url: 'https://api.pinterest.com/v1/me/boards/', qs: { access_token: token.accessToken }, json: true }, (err, request, body) => {
    if (err) { return next(err); }
    res.render('api/pinterest', {
      title: 'Pinterest API',
      boards: body.data
    });
  });
};

/**
 * POST /api/pinterest
 * Create a pin.
 */
exports.postPinterest = (req, res, next) => {
  req.assert('board', 'Board is required.').notEmpty();
  req.assert('note', 'Note cannot be blank.').notEmpty();
  req.assert('image_url', 'Image URL cannot be blank.').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/api/pinterest');
  }

  const token = req.user.tokens.find(token => token.kind === 'pinterest');
  const formData = {
    board: req.body.board,
    note: req.body.note,
    link: req.body.link,
    image_url: req.body.image_url
  };

  request.post('https://api.pinterest.com/v1/pins/', { qs: { access_token: token.accessToken }, form: formData }, (err, request, body) => {
    if (err) { return next(err); }
    if (request.statusCode !== 201) {
      req.flash('errors', { msg: JSON.parse(body).message });
      return res.redirect('/api/pinterest');
    }
    req.flash('success', { msg: 'Pin created' });
    res.redirect('/api/pinterest');
  });
};

exports.getGoogleMaps = (req, res) => {
  res.render('api/google-maps', {
    title: 'Google Maps API'
  });
};

// const {google} = require('googleapis');
// const refresh = require('passport-oauth2-refresh');


// // This is an express callback.
// exports.getGmail1 = (req, res, next) => {
//   var retries = 2;

//   var send401Response = function() {
//     return res.status(401).end();
//   };

//   // Get the user's credentials.
//   User.findById(req.user, function(err, user) {
//     if(err || !user) { return send401Response(); }

//     var makeRequest = function() {
//       retries--;
//       if(!retries) {
//         // Couldn't refresh the access token.
//         return send401Response();
//       }
//       console.log('user', user.tokens[0]);
//       // Set the credentials and make the request.
//       var auth = new google.auth.OAuth2;
//       auth.setCredentials({
//         access_token: "ya29.GltrBVg6oMAPi3yVi3Q0u8r2dkd_mtQp0EIAbS5e_GCMFITb5L2OHjYvlBgdyGtASxbtmEMbvrxZDCAtzI6pziCIiew_GLh57kUTEf7lDKjQQPtLj9hba4ltZYv3",
//         refresh_token: "1/tFaMP0tTHDwYluEbyAn6Mqrg6oDisD7aZlTXsNemHjY"
//       });

//       // console.log('auth', auth);

//       var gmail = google.gmail('v1');
//       var request = gmail.users.getProfile({
//         auth: auth,
//         userId: 'me'
//       }, (err, resp) => {
//         if (err) {
//           console.log('err', err);
//         }

//         console.log("hurray", resp);
//         return res.json(resp);
//       });
//       // request.then(function(resp) {
//       //   // Success! Do something with the response
//       //   console.log("hurray", resp);
//       //   return res.json(resp);

//       // }, function(reason) {
//       //   if(reason.code === 401) {
//       //     // Access token expired.
//       //     // Try to fetch a new one.
//       //     refresh.requestNewAccessToken('google', user.tokens.refreshToken, function(err, accessToken) {
//       //       if(err || !accessToken) { return send401Response(); }

//       //       // Save the new accessToken for future use
//       //       user.save({ tokens: { accessToken: accessToken, refreshToken: refreshToken } }, function() {
//       //        // Retry the request.
//       //        makeRequest();
//       //       });
//       //     });

//       //   } else {
//       //     // There was another error, handle it appropriately.
//       //     return res.status(reason.code).json(reason.message);
//       //   }
//       // });
//     };

//     // Make the initial request.
//     makeRequest();
//   });
// }

// accessToken ya29.GltrBSG4hYXYuBmPpU5YjO1Z_eCiDeT5QFuY1N3emW0vx8_vSHpei56SNcSlD6QalSkb3bClHUz4PHF65zZz_GYTc2R7-qG1Kl60djNqAW4Q0nO66GXC4dM0EVNl
// refreshToken 1/a6IZGZq6yNwWRl5Frvy-NDWUDc1bXxBjiRKuF8JAexw
// new // ya29.GltrBTqGtpb5-58ySNZ4k3fJgHEautp4rhngINEv6-d__4LAomvKD6k6Nt2YNF4gqT2iE92inq7vA6Z_EBdHNL3myirzy9xqe_3o3CPcFajKqFWzqvWmy3YOgwp_
// old ya29.GltsBetgVdNIrpvfMco9v51QDkt6DMI-0MdZWHub7rESbUkFYGjcxYYj8s3aGEg-5T1CEWJ1UZ-rxCBIeOyR_a0ykmkH8fA-LD1Q_mfnv4Vkbrvd_6hSVmQreRvR

// latest ya29.GltsBQ8YaPyTGuNtDIxmF8_8Van5RCik-cr3yaeQDH6KBSZr52hOKSGNIFpaoVKGdcC_1-fR9Ag0Dn4jHfQZxOzq_x2cfjpVMSyr6w6eOScfGrdVXqU_V_AMBbeu

// latest ya29.GltsBdk5AAmxCqbTHMLsPiVbsoxIJuA8hLhU4Mg37sqR9GqVPSDBfhZBI71lQZNEro_MthZgko6CGn-tL_n1zWCXVzIwa4TU4LPEH_vdXHiuNK1hft-gxB2GKz6g

// latest ya29.GltsBZHaJtgYu0ocppCNFUmI2bKMuG-rN9Dx1KOhib5ifgGTgflWLj8tPmgg80C1E_GfDO6ch9nbyWG5lLGmSMnaKm830pFwRSRnEEwyc6me32Q-jBSecfEyacHg
exports.getGmail = (req, res) => {
  const token = req.user.tokens.find(token => token.kind === 'google');

  console.info('token latest', token.accessToken);
  
  const Gmail = require('node-gmail-api');

  console.log('check', "ya29.GltsBetgVdNIrpvfMco9v51QDkt6DMI-0MdZWHub7rESbUkFYGjcxYYj8s3aGEg-5T1CEWJ1UZ-rxCBIeOyR_a0ykmkH8fA-LD1Q_mfnv4Vkbrvd_6hSVmQreRvR" === token.accessToken);

  let header_data = [];
  const gmail = new Gmail(token.accessToken);
  const s = gmail.messages('label:inbox', { fields: ['id', 'internalDate', 'snippet', 'historyId', 'labelIds', 'payload', 'sizeEstimate'], max: 200});
  s.on('data', function (d) {
    header_data.push(d);
    // console.log(d);
  })
  .on('end', function() {
    // console.log('header_data', header_data);
    const headers = header_data.map(obj => obj.payload.headers);
    
    const origination_stats = headers.map(header => header.filter(obj => obj.name && obj.name === 'Received' && obj.value && obj.value.startsWith('from ')));

    let origination_ips = origination_stats.map(array => array[0].value.match(/\[\d+\.\d+\.\d+\.\d+\]/g)[0]);
    origination_ips = origination_ips.map(ip => {
    
    return {
        'ip': ip.substr(1, ip.length - 2), 
        'geo': geoip.lookup(ip.substr(1, ip.length - 2))
      }

    });
    // console.log('origination_ips', origination_ips);

    dict = {};
    const resarray = origination_ips.forEach(orig => {
      if (dict[orig['ip']]) {
        dict[orig['ip']].counter += 1;
        
      } else {
      orig['counter'] = 1;
      dict[orig['ip']] = orig;
    }
    });

// `Origination at ip: ${arr['ip']}\ncountry: ${arr.geo.country}\nregion: ${arr.geo.region}\ncity: ${arr.geo.city}\nzip: ${arr.geo.zip}`,
    bubs = Object.values(dict).map(arr => {
      return {
        name: arr.ip,
        fillKey: 'TEST',
        frequency: arr.counter,
        city: arr.geo.city,
        zip: arr.geo.zip,
        region: arr.geo.region,
        radius: arr.counter < 10 ? arr.counter * 2 : arr.counter,
        country: arr.geo.country == 'US' ? 'USA' : arr.geo.country,
        latitude: arr.geo.ll[0],
        longitude: arr.geo.ll[1]
      }
    });

    console.log('bubs', bubs);

    // const res = origination_ips.map(orig => {
    //   return {
    //     name: `Originated in ${orig.geo.country}`,


    //   }
    // });
    // const Datamap = require('datamaps');

    res.render('api/gmail', { ips: JSON.stringify(bubs) });
  })

  
  
  // console.log('token', token);
  // console.log('token.accessToken', token.accessToken);
  // let gmail = new Gmail(token.accessToken);
  // console.log();
  // console.log(gmail);
  // let s = gmail.messages('label:inbox', {max: 10});

  // let s = gmail.messages('label:inbox', {max: 10});
  // s.on('data', function (d) {
  //   console.log(d.snippet)
  // });
};
