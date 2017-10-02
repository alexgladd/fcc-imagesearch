// server.js
// where your node app starts

// setup
const imgurOpts = {
  "method": "GET",
  "hostname": "api.imgur.com",
  "headers": {
    "authorization": "Client-ID " + process.env.IMGUR_ID
  }
};

const imgurPath = '/3/gallery/search/top/all';

// init mongoose
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
mongoose.connect(process.env.MONGO_URI, { useMongoClient: true, promiseLibrary: global.Promise });

const imgSearchSchema = new Schema({
  search: String,
  count: { type: Number, default: 1 }
}, {
  timestamps: true
});

const ImageSearch = mongoose.model('ImageSearch', imgSearchSchema);

var async = require('async');

// record an image search
function recordImageSearch(searchTerm) {
  console.log('Recording image search...');
  async.waterfall([
    function(next) {
      ImageSearch.findOne({ search: searchTerm }, function(err, existing) {
        if (err) {
          next(err);
        } else {
          next(null, existing);
        }
      });
    },
    function(existing, next) {
      let iSearch;
      if (existing) {
        console.log('Found existing search term record');
        iSearch = existing
        iSearch.count = iSearch.count + 1;
      } else {
        iSearch = new ImageSearch({
          search: searchTerm
        });
      }
      
      iSearch.save(function(err, updated) {
        if (err) {
          next(err);
        } else {
          next(null, updated);
        }
      });
    }
  ], function(err, result) {
    if (err) {
      console.log('Encountered error while recording image search');
    } else {
      console.log('Successfully recorded image search');
      console.log(result);
    }
  });
}

// get latest image searches
function getLatestImageSearches(response) {
  ImageSearch.find({}).sort({ updatedAt: -1 }).limit(50).exec(function(err, searches) {
    if (err) {
      response.status(500).json({ error: 'Encountered error retrieving latest image searches' });
    } else {
      const latestSearches = searches.map(function(search) {
        return {
          searchTerm: search.search,
          searchCount: search.count,
          lastSearch: search.updatedAt
        };
      });
      
      response.json({ latestSearches: latestSearches });
    }
  });
}


// init project
var http = require('https');
var express = require('express');
var app = express();

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

// api business logic

var api = express.Router();

api.get('/imagesearch/latest', function(req, res) {
  getLatestImageSearches(res);
});

api.get('/imagesearch/:query', function(req, res) {
  let opts = Object.assign({}, imgurOpts);
  
  let path;
  if (req.query.page && !isNaN(req.query.page)) {
    path = imgurPath + '/' + req.query.page + '/?q=' + req.params.query;
  } else {
    path = imgurPath + '/?q=' + req.params.query;
  }
  
  opts.path = encodeURI(path);
  
  console.log(opts);
  
  const imgReq = http.request(opts, function(imgRes) {
    let results = '';
    
    imgRes.setEncoding('utf8');
    imgRes.on('data', function(chunk) { results += chunk; });
    imgRes.on('end', function() {
      const imgResults = JSON.parse(results);
      const myResults = imgResults.data.map(function(item) {
        return {
          title: item.title,
          type: item.type,
          nsfw: item.nsfw,
          link: item.link
        };
      });
      
      console.log('Result count: ' + imgResults.data.length);
      res.json(myResults);
    });
  });
  
  imgReq.on('error', function(e) {
    res.status(500).json({ error: 'Encountered error: ' + e.message });
  });
  
  imgReq.end();
  
  // record search
  recordImageSearch(req.params.query);
});

app.use('/api', api);

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
