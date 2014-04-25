var m = require('../mongolite.js');

var o = {"db_name":"GregsDB","data":'[{"n":"greg","age":41},{"n":"Ivette","age":35},{"n":"Tucker","age":36}]'};
console.log( o.data );
var j = JSON.parse(o.data);
var s = JSON.stringify(j,null,'  ');
console.log( s );

var db = m.open(o);

var r = db.find(/.*/);
r._data.forEach(function(i){
    console.log(i.n + ' ' + i.age);
});
