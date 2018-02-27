const bluebird = require('bluebird');
const request = bluebird.promisifyAll(require('request'), { multiArgs: true });
const cheerio = require('cheerio');

const User = require('../models/User');
const geoip = require('geoip-lite');

const Gmail = require('node-gmail-api');
/**
 * GET /api/gmail
 *
 */
exports.getApi = (req, res) => {
  res.render('api/index', {
    title: 'API Examples'
  });
};

exports.getGmail = (req, res) => {
  const token = req.user.tokens.find(token => token.kind === 'google');
  const gmail = new Gmail(token.accessToken);
  
  let header_data = [];
  const s = gmail.messages('label:inbox', { 
    fields: [ 'id', 'internalDate', 'snippet', 'historyId', 'labelIds', 'payload', 'sizeEstimate' ], 
    max: 250
  });

  s.on('data', function (d) {
    header_data.push(d);
  })
  .on('end', function() {
    const headers = header_data.map(obj => obj.payload.headers);
    const origination_stats = headers.map(header => header.filter(obj => obj.name && obj.name === 'Received' && obj.value && obj.value.startsWith('from ')));

    let origination_ips = origination_stats.map(array => { 
      if (array[0])
        return array[0].value.match(/\[\d+\.\d+\.\d+\.\d+\]/g)[0]
      else
        return '[0.0.0.0]'
    });

    origination_ips = origination_ips.map(ip => {
      return {
          'ip': ip.substr(1, ip.length - 2), 
          'geo': geoip.lookup(ip.substr(1, ip.length - 2))
        }
    });

    dict = {};
    origination_ips.forEach(orig => {
      if (dict[orig['ip']]) {
        dict[orig['ip']].counter += 1;
      } else {
        orig['counter'] = 1;
        dict[orig['ip']] = orig;
      }
    });

    delete dict['0.0.0.0'];

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

    res.render('api/gmail', { ips: JSON.stringify(bubs) });
  })
};
