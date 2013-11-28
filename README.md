# Mongolite

Mongolite - A tiny, self-contained, single file database, written in pure Javascript, which aims to support a functional subset of MongoDB commands. It works seamlessly in both the client (browser) and the server (Node.js).  Just include it in your project and go.  The database format is stored as human-readable JSON, one file per each database.

## Examples

To use mongolite.js in node.js, simple do
```js
var mongolite = require( './mongolite.js' ); // path to JS

var db = mongolite.open( path_to_db );      // ** there are multiple ways to open a db, but the simplest is to put 
                                            //    the path and filename to where you want it. Eg.: "/tmp/my_data.db"

db.insert( {key:"Anything you want"} );

var result = db.find( /regex/ );            // ** find() command works like MongoDB
                                            // ** returns db_result, which has a length property and _data[] array
                                            //    as well as chainable methods like: .sort(), .limit(), .skip(), ..
```

## In the Works

1. Better documentation; Website.
 
2. Feature Roadmap: which features will be implemented next, roughly in order.

3. Sample projects built on mongolite demonstrating its features and functionality.


## Contact 

Mail: greg AT naughton.org for questions, comments
