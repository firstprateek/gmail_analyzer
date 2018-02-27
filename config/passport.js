const passport = require('passport');
// const refresh = require('passport-oauth2-refresh');
const request = require('request');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const OpenIDStrategy = require('passport-openid').Strategy;
const OAuthStrategy = require('passport-oauth').OAuthStrategy;
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy;

const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

/**
 * Sign in using Email and Password.
 */
passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
  User.findOne({ email: email.toLowerCase() }, (err, user) => {
    if (err) { return done(err); }
    if (!user) {
      return done(null, false, { msg: `Email ${email} not found.` });
    }
    user.comparePassword(password, (err, isMatch) => {
      if (err) { return done(err); }
      if (isMatch) {
        return done(null, user);
      }
      return done(null, false, { msg: 'Invalid email or password.' });
    });
  });
}));

/**
 * OAuth Strategy Overview
 *
 * - User is already logged in.
 *   - Check if there is an existing account with a provider id.
 *     - If there is, return an error message. (Account merging not supported)
 *     - Else link new OAuth account with currently logged-in user.
 * - User is not logged in.
 *   - Check if it's a returning user.
 *     - If returning user, sign in and we are done.
 *     - Else check if there is an existing account with user's email.
 *       - If there is, return an error message.
 *       - Else create a new account.
 */

/**
 * Sign in with Google.
 */
const google_stratergy = new GoogleStrategy({
  clientID: "1009589347679-teq0ft7m76suci3563i40i7tomn7mbms.apps.googleusercontent.com",
  clientSecret: "-o2GDW3TP9BdKi50PK_I5yw3",
  callbackURL: '/auth/google/callback',
  passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
  console.log('accessToken', accessToken);
  console.log('refreshToken', refreshToken);
  if (req.user) {
    User.findOne({ google: profile.id }, (err, existingUser) => {
      if (err) { return done(err); }
      if (existingUser) {
        existingUser.tokens = [({ kind: 'google', accessToken, refreshToken })];
        existingUser.save((err) => {
          req.flash('errors', { msg: 'There is already a Google account that belongs to you. Sign in with that account or delete it, then link it with your current account.' });
          done(err, existingUser);
        });
        
      } else {
        User.findById(req.user.id, (err, user) => {
          if (err) { return done(err); }
          user.google = profile.id;
          console.log('accesstoken', accessToken);
          user.tokens = [({ kind: 'google', accessToken, refreshToken })];
          user.profile.name = user.profile.name || profile.displayName;
          user.profile.gender = user.profile.gender || profile._json.gender;
          user.profile.picture = user.profile.picture || profile._json.image.url;
          user.save((err) => {
            req.flash('info', { msg: 'Google account has been linked.' });
            done(err, user);
          });
        });
      }
    });
  } else {
    User.findOne({ google: profile.id }, (err, existingUser) => {
      if (err) { return done(err); }
      if (existingUser) {
        existingUser.tokens = [({ kind: 'google', accessToken, refreshToken })];
        existingUser.save((err) => {
          return done(err, existingUser);
        });
      }
      User.findOne({ email: profile.emails[0].value }, (err, existingEmailUser) => {
        if (err) { return done(err); }
        if (existingEmailUser) {
          existingEmailUser.tokens = [({ kind: 'google', accessToken, refreshToken })];
          existingEmailUser.save(err => {
            req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with Google manually from Account Settings.' });
            done(err, existingEmailUser);
          });
        } else {
          const user = new User();
          user.email = profile.emails[0].value;
          user.google = profile.id;
          user.tokens.push({ kind: 'google', accessToken, refreshToken });
          user.profile.name = profile.displayName;
          user.profile.gender = profile._json.gender;
          user.profile.picture = profile._json.image.url;
          user.save((err) => {
            done(err, user);
          });
        }
      });
    });
  }
});

passport.use(google_stratergy);
// refresh.use(google_stratergy);

/**
 * Tumblr API OAuth.
 */
passport.use('tumblr', new OAuthStrategy({
  requestTokenURL: 'http://www.tumblr.com/oauth/request_token',
  accessTokenURL: 'http://www.tumblr.com/oauth/access_token',
  userAuthorizationURL: 'http://www.tumblr.com/oauth/authorize',
  consumerKey: process.env.TUMBLR_KEY,
  consumerSecret: process.env.TUMBLR_SECRET,
  callbackURL: '/auth/tumblr/callback',
  passReqToCallback: true
},
  (req, token, tokenSecret, profile, done) => {
    User.findById(req.user._id, (err, user) => {
      if (err) { return done(err); }
      user.tokens.push({ kind: 'tumblr', accessToken: token, tokenSecret });
      user.save((err) => {
        done(err, user);
      });
    });
  }
));

/**
 * Foursquare API OAuth.
 */
passport.use('foursquare', new OAuth2Strategy({
  authorizationURL: 'https://foursquare.com/oauth2/authorize',
  tokenURL: 'https://foursquare.com/oauth2/access_token',
  clientID: process.env.FOURSQUARE_ID,
  clientSecret: process.env.FOURSQUARE_SECRET,
  callbackURL: process.env.FOURSQUARE_REDIRECT_URL,
  passReqToCallback: true
},
  (req, accessToken, refreshToken, profile, done) => {
    User.findById(req.user._id, (err, user) => {
      if (err) { return done(err); }
      user.tokens.push({ kind: 'foursquare', accessToken });
      user.save((err) => {
        done(err, user);
      });
    });
  }
));

/**
 * Steam API OpenID.
 */
passport.use(new OpenIDStrategy({
  apiKey: process.env.STEAM_KEY,
  providerURL: 'http://steamcommunity.com/openid',
  returnURL: 'http://localhost:3000/auth/steam/callback',
  realm: 'http://localhost:3000/',
  stateless: true
}, (identifier, done) => {
  const steamId = identifier.match(/\d+$/)[0];
  const profileURL = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_KEY}&steamids=${steamId}`;

  User.findOne({ steam: steamId }, (err, existingUser) => {
    if (err) { return done(err); }
    if (existingUser) return done(err, existingUser);
    request(profileURL, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        const data = JSON.parse(body);
        const profile = data.response.players[0];

        const user = new User();
        user.steam = steamId;
        user.email = `${steamId}@steam.com`; // steam does not disclose emails, prevent duplicate keys
        user.tokens.push({ kind: 'steam', accessToken: steamId });
        user.profile.name = profile.personaname;
        user.profile.picture = profile.avatarmedium;
        user.save((err) => {
          done(err, user);
        });
      } else {
        done(error, null);
      }
    });
  });
}));

/**
 * Pinterest API OAuth.
 */
passport.use('pinterest', new OAuth2Strategy({
  authorizationURL: 'https://api.pinterest.com/oauth/',
  tokenURL: 'https://api.pinterest.com/v1/oauth/token',
  clientID: process.env.PINTEREST_ID,
  clientSecret: process.env.PINTEREST_SECRET,
  callbackURL: process.env.PINTEREST_REDIRECT_URL,
  passReqToCallback: true
},
  (req, accessToken, refreshToken, profile, done) => {
    User.findById(req.user._id, (err, user) => {
      if (err) { return done(err); }
      user.tokens.push({ kind: 'pinterest', accessToken });
      user.save((err) => {
        done(err, user);
      });
    });
  }
));

/**
 * Login Required middleware.
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
};

/**
 * Authorization Required middleware.
 */
exports.isAuthorized = (req, res, next) => {
  const provider = req.path.split('/').slice(-1)[0];
  const token = req.user.tokens.find(token => token.kind === provider);
  if (token) {
    next();
  } else {
    res.redirect(`/auth/${provider}`);
  }
};
