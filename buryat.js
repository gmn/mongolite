/**

    buryat.js   A tiny, self-contained, single file database that aims to support a useful
                subset of MongoDB commands.  Its per-DB storage is a single JSON string, which can be 
                stored anywhere: in the server's file-system, or localStorage in the browser.
                See buryat.org for more details and documentation, https://github.com/gmn/buryat
                for new releases and code.
  
*/

(function(buryat) 
{
    'use strict';

    //////////////////////////////////////////////////
    //
    // utility functions, internal
    //

    var p = function(s) { console.log(s); };

    function type_of( t ) {
        var s = typeof t;
        switch( s ) {
        case "object":
            if ( t instanceof Date ) {
                return "date";
            }
            else if ( t instanceof Array ) {
                return "array";
            }
            else if ( t instanceof RegExp ) {
                return "regexp";
            }
        default:
            return s;
        }
    }

    function detect_platform() {
        var platform = "unknown";
        try {
            if ( exports !== undefined )
                platform = "node_module";
        } catch(e) {
            try {
                if ( window !== undefined )
                    platform = "browser";
            } catch(e) {
            }
        }
        return platform;
    }

    function clip_all_leading(str, clip)
    {
        while ( str.length && str.charAt(0) === clip ) {
            str = str.substring(clip.length,str.length);
        }
        return str;
    }

    function _firstKey( O )
    {
        for ( var i in O ) {
            if ( O.hasOwnProperty(i) )
                return i;
        }
        return null;
    }

    // converts object {key1:val1,key2:val2,...} 
    // into array [{key:key1,value:val1},{key:key2,value:val2},...]
    // recurses, so: obj {key1:{key2:val2,key3:val3}} becomes:
    //  [{key:key1,value:[{key:key2,value:val2},{key:key3,value:val3}]}]
    function _getKeys( O ) 
    {
        var keys = [];
        if ( type_of(O) !== "object" )
            return null;
        for ( var i in O ) 
        {
            if ( O.hasOwnProperty(i) ) 
            {
                var _val = type_of(O[i]) === "object" ? 
                        _getKeys(O[i]) : O[i];

                if ( type_of(_val) === "array" && _val.length === 1 )
                    _val = _val[0]; // ditch the array if only 1 elt
                    
                keys.push( {key:i,value:_val} );
            }
        }
        return keys;
    }

    // takes an object and sorts it by its keys, alphabetically
    function sortObjectByKeys( O )
    {
        if ( typeof O !== "object" || (O instanceof Array) )
            return O;

        var keys = [];

        for ( var i in O ) {
            if ( O.hasOwnProperty(i) ) {
                keys.push( {key:i,value:O[i]} );
            }
        }
        if ( keys.length === 0 )
            return O;

        keys.sort( function(a,b) { return a.key < b.key ? -1 : 1; } );

        var nO = {};

        keys.forEach( function(item) {
            nO[item.key] = item.value;
        });

        return nO;
    }

        // sorts in place
    function sortArrayOfObjectsByKeys( array_of_objs )
    {
        if ( type_of(array_of_objs) !== "array" )
            return array_of_objs;

        if ( array_of_objs.length === 0 )
            return array_of_objs;

        // sort each key
        array_of_objs.forEach(function(val,index,ary) {
            ary[index] = sortObjectByKeys(val);
        });

        // sort entire array by firstKey
        array_of_objs.sort(function(a,b){
            return _firstKey(a) < _firstKey(b) ? -1 : 1;
        });

        return array_of_objs;
    }

    //////////////////////////////////////////////////
    // 
    // Classes
    // 

    /**
     *
     * Class: db_result
     *
     */
    function db_result( arg ) 
    {
        this.length = 0;
        this._data = [];            

        // sort of a copy-constructor. If Array of Obj is passed in,
        //  we clone it into _data 
        if ( arguments.length === 1 && type_of(arg) === "array" ) 
        {
            for ( var i = 0, l = arg.length; i < l; i++ ) {
                this.push( arg[i] );
            }
        }
    }

    db_result.prototype = {
        push: function( O ) {
            if ( type_of(O) === "object" )
                this._data.push(JSON.parse(JSON.stringify(O)));
            this.length = this._data.length;
            return this;
        },

        /* 
         SELECT * FROM users WHERE status = "A" ORDER BY user_id ASC
           db.users.find( { status: "A" } ).sort( { user_id: 1 } )
         SELECT * FROM users WHERE status = "A" ORDER BY user_id DESC
           db.users.find( { status: "A" } ).sort( { user_id: -1 } ) 
        */
        sort: function( O ) {
            var key = _firstKey(O);
            var val = O[key];

            this._data.sort(function(a,b) 
            {
                if ( !a[key] )
                    return -val;
                else if ( !b[key] )
                    return val;
                if ( typeof a[key] === "string" && typeof b[key] === "string" )
                    return a[key].localeCompare(b[key]) * val;
                else
                    return a[key] > b[key] ? val : -val;
            });

            return this;
        },

        limit: function( _l ) {
            var lim = Number(_l);
            if ( type_of(lim) !== "number" )
                return this;
            this._data.splice( lim, this._data.length - lim );
            this.length = this._data.length;
            return this;
        },

        skip: function( O ) {
            return this;
        },

        distinct: function( O ) {
            return this;
        },

        count: function() {
            return this._data.length;
        },

        getArray: function() {
            return this._data;
        },
        get_json: function(fmt) {
            if ( arguments.length === 0 )
                return JSON.stringify(this._data);
            return JSON.stringify(this._data,null,fmt);
        }
    }; // db_result


    /**
     *
     * Class: db_set
     *  - returned by open()
     *  - contains entire database w/ accessor methods
     *
     */
    function db_set( config ) 
    {
        this.platform = config.platform;
        this.db_path = config.db_path;
        this.db_dir = config.db_dir;
        this.db_name = config.db_name;
        this.master = [];
        this._id = 0;

        //
        // read in db if it's there
        //
        if ( this.platform === "browser" )
        {
            var name = this.db_name.trim();
            this.db_name = ( !name || name.length===0 || name === "test.db" ) ? 'buryat' : name;

            if ( window.localStorage && localStorage.hasOwnProperty( this.db_name ) ) {
                var string = localStorage[this.db_name];
                this.master = JSON.parse( string );
            }
        }
        else if ( this.platform === "node_module" )
        {
            var fs = require('fs');
            if ( fs.existsSync( this.db_path ) ) 
            {
                var data = fs.readFileSync(this.db_path,{encoding:"utf8",flag:'r'});

                // convert into master format
                this.master = JSON.parse( data );
            }
        }


        if ( this.master.length > 0 ) 
        {
            // next _id is 1 greater than highest _id
            var highest = 0;
            var any_missing = false;
            this.master.forEach(function(row) {
                if ( ! row['_id'] )
                    any_missing = true;
                else if ( row['_id'] > highest ) {
                    highest = row['_id'];
                }
            });

            // rows w/o _id need to have one added 
            if ( any_missing ) {
                this.master.forEach(function(r) {
                    if ( !r['_id'] ) {
                        r['_id'] = ++highest;
                    }
                });
            }
        
            this._id = highest;
            
            // sort in place ?
            // - sort each object
            // - sort array by leading keys
        }

        /* 
        return {
            db_name: this.db_name,
            db_dir: this.db_dir,
            db_path: this.db_path,

            save: this.save,
            insert: this.insert,
            update: this.update,
            find: this.find,
            remove: this.remove,
            get_json: this.get_json,
            now: this.now,
            count: this.count
        }; */
    }

    db_set.prototype = {

        //////////////////////////////////////////////////
        //
        // public methods
        //
        save: function(_mode) 
        {
            if ( this.platform === "node_module" ) {
                var mode = _mode || 438; // 0666;
                try {
                    var fs = require('fs');
                    fs.writeFileSync( this.db_path, JSON.stringify(this.master), {encoding:"utf8",mode:mode,flag:'w'} );
                }
                catch(e) {
                    console.log( "buryat: error: failed to write: \""+this.db_path+'"' );
                }
            } else if ( this.platform === "browser" ) {
                localStorage[this.db_name] = JSON.stringify(this.master);
            }
        }, // this.save

        // returns last _id insert
        insert: function( Arg ) 
        {
            var id_set = -1;
            var that = this;

            function insert_one( obj )
            {
                if ( type_of( obj ) !== "object" ) {
                    return -1;
                }

                if ( !obj["_id"] ) 
                    obj["_id"] = ++that._id;

                that.master.push(obj);

                return obj["_id"];
            }


            if ( type_of( Arg ) === "array" ) 
            {
                for ( var i = 0, l = Arg.length; i < l; i++ ) {
                    id_set = insert_one( Arg[i] );
                }
            } else {
                id_set = insert_one( Arg );
            }

            return id_set;
        }, // this.insert

        /**
         *
         * update
         *
            options:
              upsert - If set to true, creates a new document when no document matches the query criteria. default is false
              multi - If set to true, updates multiple documents that meet the query criteria. If set to false, updates one document. default is false.

            returns the number of rows altered
         */
        update: function( query, _update, options ) 
        {
            if ( arguments.length < 2 )
                return 0;

            if ( type_of(query) !== "object" ||
                type_of(_update) !== "object" )
                return 0;

            if ( arguments.length === 3 && type_of(options) !== "object" )
                return 0;

            var set = _update['$set'];
            if ( !set )
                return 0;

            // these are the rows we're updating
            var res = this.do_query( query );

            var do_multi = false, do_upsert = false;

            if ( arguments.length === 3 ) {
                do_multi = options['multi'] ? options['multi'] : false;
                do_upsert = options['upsert'] ? options['upsert'] : false;
            }

            // chance to upsert
            if ( res.length === 0 && do_upsert ) {
                this.insert( set );
                return 1;
            }

            var rows_altered = 0;

            // foreach row of the matching result
            for ( var i = 0, l = res.length; i < l; i++ ) {
                var row = res[i];
                // foreach key/value in $set, update a row
                var did_change = false;
                for ( var j in set ) {
                    if ( set.hasOwnProperty(j) ) {
                        var key = j;
                        var value = set[j];
                        if ( !row[key] || row[key] !== value ) {
                            row[key] = value;
                            did_change = true;
                        }
                    }
                }
                if ( did_change )
                    ++rows_altered;
                if ( !do_multi ) 
                    break; // do 1 row only 
            }

            return rows_altered;
        }, // this.update

        find: function( match ) 
        {
            var res = this.do_query( match );
            var dbres = new db_result( res );
            res = null;
            return dbres;
        }, // this.find

        // returns number rows altered
        remove: function( constraints ) 
        {
            if ( arguments.length === 0 )
                var constraints = {};
            if ( type_of(constraints) !== "object" )
                return 0;

            var rows_altered = 0;

            // get the rows to remove
            var rows = this.do_query( constraints );
            if ( rows.length === 0 )
                return 0; 
        
            var rmids = [];

            // collect row _id's
            for ( var i = 0, l = rows.length; i < l; i++ ) {
                var id = rows[i]['_id']; 
                if ( !id )
                    continue;
                rmids.push( id );
            }

            if ( rmids.length === 0 )
                return 0;

            var new_master = this.master.filter(function(row) {
                for ( var i = 0, l = rmids.length; i < l; i++ ) {
                    if ( row['_id'] && row['_id'] === rmids[i] ) {
                        ++rows_altered;
                        return false;
                    } 
                }    
                return true;
            });

            if ( rows_altered > 0 )
                this.master = new_master;
            
            return rows_altered;

        }, // this.remove

        get_json: function() {
            return JSON.stringify( this.master );
        }, // this.get_json
    
        now: function() 
        {
            var n = new Date();

            if ( n.toISOString && typeof n.toISOString === "function" ) {
                return n.toISOString();
            }

            return n.getFullYear() + '-' + 
                    (n.getMonth()+1) + '-' + 
                    n.getDate() + 'T' + 
                    n.toUTCString().replace( /.*(\d\d:\d\d:\d\d).*/, "$1" ) + '.000Z';
        }, // this.now

        count: function() {
            return this.master.length;
        },

        //////////////////////////////////////////////////
        //
        // private methods (not returned in constructor)
        //

        // query matching functions
        detect_clause_type: function( key, value )
        {
            switch ( type_of(value) )
            {
            case "boolean":
            case "date":
            case "number":
            case "string": // NORMAL | SUBDOCUMENT_MATCH
            case "regexp":
                return key.indexOf('.') === -1 ? "CLAUSE_NORMAL" : "CLAUSE_SUBDOCUMENT_MATCH";
            case "object": // CONDITIONAL | SUBDOCUMENT
                var fk = _firstKey(value);
                switch(fk) {
                case '$gt': 
                case '$gte': 
                case '$lt': 
                case '$lte': 
                case '$exists':
                    return "CLAUSE_CONDITIONAL";
                default:
                    return "CLAUSE_SUBDOCUMENT";
                }
                break;
            case "array": // OR | ARRAY
                return key === '$or' ? "CLAUSE_OR" : "CLAUSE_ARRAY";
            default:
                break;
            }
            return "CLAUSE_UNKNOWN";

        }, // this.detect_clause_type

        matching_rows_NORMAL: function( test, rows )
        {
            var res = [];
            var i = 0;

            // for all rows
        next_row:
            for ( var l = rows.length; i < l; i++ )
            {
                var row = rows[i];

                // for each unique key in the row
                for ( var key in row )
                {
                    // matches our query key
                    if ( row.hasOwnProperty(key) && key === test.key ) 
                    {
                        // RegExps: equiv to SQL "like" statement
                        if ( type_of( test.value ) === "regexp" ) {
                            var sval = row[key] + '';
                            if ( sval.match( test.value ) ) {
                                res.push( row );
                                continue next_row;
                            }
                        // compare number, date, string statements directly
                        } else {
                            if ( row[key] === test.value ) {
                                res.push( row );
                                continue next_row;
                            }
                        }
                    } // key match

                } // each row key
    
            } // each row

            return res;
        }, // matching_rows_NORMAL

        matching_rows_CONDITIONAL: function( test, rows )
        {
            var res = [];
            var i = 0;
            var cond = _firstKey(test.value);

        next_row:
            // foreach row
            for ( var l = rows.length; i < l; i++ )
            {
                var row = rows[i];

                if ( cond === '$exists' ) {
                    if ( test.value[cond] ) {   /* true */
                        if ( row[test.key] ) {
                            res.push( row );
                            continue next_row;
                        }
                    } else {                    /* false */
                        if ( ! row[test.key] ) {
                            res.push( row );
                            continue next_row;
                        }
                    }
                    continue next_row;
                }

                // for every unique key in row
                for ( var key in row )
                {
                    // key matches
                    if ( row.hasOwnProperty(key) && key === test.key ) 
                    {
                        switch ( cond ) {
                        case '$lt':
                            if ( row[key] < test.value[cond] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$lte':
                            if ( row[key] <= test.value[cond] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$gt':
                            if ( row[key] > test.value[cond] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$gte':
                            if ( row[key] >= test.value[cond] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        default:
                            break;
                        }
                    } // key match
                } // each key in row
            } // each row

            // remove the key:value from test object
            if ( cond )
                delete test.value[cond];

            return res;
        }, // matching_rows_CONDITIONAL

        matching_rows_OR: function( array, rows )
        {
            var res = [];
            var i = 0;
        next_row:
            for ( var l = rows.length; i < l; i++ )
            {
                var row = rows[i];

                for ( var j = 0, la = array.length; j < la; j++ ) 
                {
                    var eltkey = _firstKey( array[j] );
                    var eltval = array[j][eltkey];
                    var test = { key:eltkey, value:eltval };

                    var clausetype = this.detect_clause_type( eltkey, eltval );

                    switch ( clausetype )
                    {
                    case "CLAUSE_NORMAL":
                        if ( type_of( test.value ) === "regexp" ) {
                            if ( row[test.key].match( test.value ) ) {
                                res.push( row );
                                continue next_row;
                            }
                        } else {
                            if ( row[test.key] === test.value ) {
                                res.push( row );
                                continue next_row;
                            }
                        }
                        break;
                    case "CLAUSE_CONDITIONAL":
                        switch( _firstKey(test.value) ) {
                        case '$gt':
                            if ( row[test.key] > test.value['$gt'] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$gte':
                            if ( row[test.key] >= test.value['$gte'] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$lt':
                            if ( row[test.key] < test.value['$lt'] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$lte':
                            if ( row[test.key] <= test.value['$lte'] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        case '$exists':
                            if ( row[test.key] !== undefined && test.value['$exists'] ) {
                                res.push(row);
                                continue next_row;
                            } else if ( row[test.key] === undefined && !test.value['$exists'] ) {
                                res.push(row);
                                continue next_row;
                            }
                            break;
                        }
                        break;
                    default:
                        break;
                        //p( "NOT HANDLING CLAUSE TYPE: \"" + clausetype + '"' );
                    }
                }
            }
            return res;
        }, // matching_rows_OR

        do_query: function( clauses )
        {
            var result = this.master;

            // CLAUSE_EMPTY
            if ( !clauses || (type_of(clauses)==="object" && _firstKey(clauses)===null) ) {
                return result;
            }

            // 
        next_clause:
            for ( var clause in clauses ) 
            { 
                if ( ! clauses.hasOwnProperty(clause) )
                    continue next_clause;

                var clausetype = this.detect_clause_type(clause,clauses[clause]);
                switch ( clausetype )
                {
                case "CLAUSE_NORMAL": // simple key/value 
                    result = this.matching_rows_NORMAL( { key: clause, value: clauses[clause] }, result );
                    break;
                case "CLAUSE_CONDITIONAL":
                    while ( _firstKey(clauses[clause]) !== null ) {
                        result = this.matching_rows_CONDITIONAL( { key: clause, value: clauses[clause] }, result );
                    }
                    break;
                case "CLAUSE_OR":
                    result = this.matching_rows_OR( clauses[clause], result );
                    break;
                default:
                    break;
                    //p( "NOT HANDLING CLAUSE TYPE: \"" + clausetype + '"' );
                }
            }

            return result;
        }, // do_query

        sortMaster: function ()
        {
            sortArrayOfObjectsByKeys( this.master );
        }

    }; // db_set.prototype


    /**
        - MAIN MODULE INTERFACE 
        - opens physical database (new one is created if non-existent)
        - returns handle to new db_object
    */
    buryat.open = function ( config )
    {
        // private variables
        var that = this;

        // object parameters
        this.platform = detect_platform();

        switch ( this.platform ) {
        case "node_module":
            var path        = require('path');
            var fs          = require('fs');
            this.db_name    = 'test.db';
            this.db_dir     = path.resolve(__dirname);
            this.db_path    = 0;
            return server_open( config );
        case "browser":
            var _name = '';
            if ( type_of(config) === "string" )
                _name = config;
            else 
                _name = ( config && config.db_name ) ? config.db_name : '';

            return new db_set( {"platform":"browser",db_name:_name} );
        default:
            p( "unknown platform" );
            return buryat;
        }

        function server_open( config )
        {
            var parm_list = ['db_name','db_dir','db_path'];

            // assume it is either (in this order): path, fullpath, filename
            if ( arguments.length > 0 && typeof config === "string" ) 
            {
                try {
                    // is file 
                    var data = fs.readFileSync(config,{encoding:"utf8",flag:'r'}); // throws if Directory or File doesn't exist

                    // fullpath
                    that.db_path = path.resolve(config);
                    // name
                    that.db_name = clip_all_leading( that.db_path.substring( that.db_path.lastIndexOf('/'), that.db_path.length ), '/' );
                    // dir
                    that.db_dir = that.db_path.substring(0, that.db_path.lastIndexOf( that.db_name ));

                } 
                catch(e) 
                {
                    switch ( e.code ) 
                    {
                    case "ENOENT":
                        // file not exists: get db_name, db_dir
                        that.db_path = path.resolve(config); 
                        that.db_name = clip_all_leading( that.db_path.substring( that.db_path.lastIndexOf('/'), that.db_path.length ), '/' );
                        that.db_dir = that.db_path.substring(0, that.db_path.lastIndexOf( that.db_name ));
                        break;
                    case "EISDIR":
                        // is a directory: get db_dir
                        that.db_dir = path.resolve(config);
                        break;
                    default:
                        // who knows
                        break;
                    }
                }
            }

            // overwrite from user-supplied config settings
            else if ( arguments.length > 0 && typeof config === "object" ) 
            {
                for ( var i = 0; i < parm_list.length; i++ ) 
                {
                    if ( config[parm_list[i]] ) {
                        if ( parm_list[i] === "db_path" ) {
                            config[parm_list[i]] = path.resolve( config[parm_list[i]] );
                        }
                        else if ( parm_list[i] === "db_dir" )
                            config[parm_list[i]] = path.resolve( config[parm_list[i]] );
                        else if ( parm_list[i] === 'db_name' )
                            config[parm_list[i]] = clip_all_leading( config[parm_list[i]], '/' );
                        that[parm_list[i]] = config[parm_list[i]];
                    }
                }

                // if db_path supplied, check that db_name and db_dir match, or else db_name and db_dir override, and path must be reset
                if ( config.db_path ) {
                    var _n = clip_all_leading( that.db_path.substring( that.db_path.lastIndexOf('/'), that.db_path.length ), '/' );
                    var _d = that.db_path.substring(0, that.db_path.lastIndexOf( _n ));
                    var _any_changed = 0;
                    if ( _n !== that.db_name ) {
                        that.db_name = _n;
                        ++_any_changed;
                    }
                    if ( _d !== that.db_dir ) {
                        that.db_dir = _d;
                        ++_any_changed;
                    }
                    if ( _any_changed ) {
                        that.db_path = 0; 
                    }
                }
            }

            // set db_path, if we didn't get it yet
            if ( ! that.db_path ) {
                if ( that.db_dir && that.db_dir[that.db_dir.length-1] === '/' )
                    that.db_path = that.db_dir + that.db_name;
                else
                    that.db_path = that.db_dir + '/' + that.db_name;
            }

            return new db_set( {db_path:that.db_path,db_dir:that.db_dir,db_name:that.db_name,"platform":that.platform} );
        } // server_open()

    }; // buryat.open

    try {
        if ( window )
            window.buryat = buryat;
    } catch(e) {
    }

    return buryat;

})(typeof exports === "undefined" ? {} : exports);

