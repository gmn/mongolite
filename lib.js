//
// lib.js - collection of helper functions & classes 
//

(function() {

    var util = require('util');
    var fs = require('fs');

    function type_of( v ) {
        var s = typeof v;
        switch( s ) {
        case "object":
            if ( util.isDate( v ) ) {
                return "date";
            }
            else if ( util.isArray( v ) ) {
                return "array";
            }
            else if ( util.isRegExp( v ) ) {
                return "regexp";
            }
            return "object";
        default:
            return s;
        }
    }
    exports.type_of = type_of;


    function trunc_string(str,n) {
        if ( str.length <= n )
            return str;
        return str.substring(0,n).trim() + '...';
    }
    exports.trunc_string = trunc_string;


    function pobj( a1, a2 ) 
    {
        if ( arguments.length > 1 )
        {
            this.name = a1;
            this.obj = a2;
        }
        else if ( arguments.length === 1 )
        {
            this.name = '';
            this.obj = a1;
        }
        else
            return undefined;


        var p = function(s) { console.log(s); };

        if ( arguments.length === 0 ) {
            return undefined;
        }

        var s = this.name + ' ['+ typeof(this.obj) + ']: ';
        s += JSON.stringify(this.obj);
        p( s );
        return s;
    }
    exports.pobj = pobj;


    function read_file( filename )
    {
        try {
            return fs.readFileSync( filename, {encoding:'utf8',flag:'r'} );
        }
        catch(e) {
            return null;
        }
    }
    exports.read_file = read_file;


    function write_file( filename, data, mode )
    {
        var _mode = mode || 0666;
        try {
            fs.writeFileSync( filename, data, {encoding:"utf8",mode:_mode,flag:'w'} );
            return 1;
        }
        catch(e) {
            return null;
        }
    }
    exports.write_file = write_file;


    function append_file( filename, data, mode )
    {
        var _mode = mode || 0666;
        try {
            fs.writeFileSync( filename, data, {encoding:"utf8",mode:_mode,flag:'a'} );
            return 1;
        }
        catch(e) {
            return null;
        }
    }
    exports.append_file = append_file;


    // takes an object and sorts it by its keys, alphabetically
    function sortObjectByKeys( O )
    {
        var keys = [];

        for ( i in O ) {
            if ( O.hasOwnProperty(i) ) {
                keys.push( {name:i,value:O[i]} );
            }
        }
        if ( keys.length === 0 )
            return {'__firstKey':null};

        keys.sort( function(a,b) { return a.name < b.name ? -1 : 1; } );
        
        var firstKey = null;

        var o = { '__firstKey': keys[0].name };

        keys.forEach( function(item) {
            o[item.name] = item.value;
        });

        return o;
    }
    exports.sortObjectByKeys = sortObjectByKeys;


})();


