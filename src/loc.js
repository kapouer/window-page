var State = require('./state');

exports.parse = function(str) {
	var dloc = document.location;
	var loc;
	if (str == null || str == "") {
		loc = dloc;
	} else if (typeof str == "string") {
		loc = new URL(str, dloc);
	} else {
		loc = str;
	}
	var obj = new State();
	if (loc.referrer) obj.referrer = loc.referrer;
	obj.pathname = loc.pathname;
	obj.query = loc.query ? Object.assign({}, loc.query) : searchToQuery(loc.search);
	if (!obj.pathname) obj.pathname = "/";
	else if (obj.pathname[0] != "/") obj.pathname = "/" + obj.pathname;

	var hash = loc.hash || (str == null ? dloc.hash : null);
	if (hash && hash[0] == "#") hash = hash.substring(1);

	if (hash != null && hash != '') obj.hash = hash;

	if (exports.sameDomain(loc, dloc)) {
		delete obj.port;
		delete obj.hostname;
		delete obj.protocol;
	} else {
		if (!obj.hostname) {
			obj.hostname = loc.hostname;
			if (!obj.port) obj.port = loc.port;
		}
		if (!obj.protocol) obj.protocol = loc.protocol;
		if (canonPort(obj)) {
			delete obj.port;
		}
	}
	return obj;
};

exports.format = function(obj) {
	var dloc = document.location;
	if (typeof obj == "string") obj = exports.parse(obj);
	else obj = Object.assign({}, obj);
	if (obj.path) {
		var parsedPath = exports.parse(obj.path);
		obj.pathname = parsedPath.pathname;
		obj.query = parsedPath.query;
		obj.hash = parsedPath.hash;
		delete obj.path;
	}
	var qstr;
	if (obj.query) qstr = queryToString(obj.query);
	else if (obj.search) qstr = obj.search[0] == "?" ? obj.search.substring(1) : obj.search;
	obj.search = qstr;

	var keys = ["pathname", "search", "hash"];
	var relative = !obj.protocol && !obj.hostname && !obj.port;
	if (!relative) keys.unshift("protocol", "hostname", "port");

	var key;
	for (var i=0; i < keys.length; i++) {
		key = keys[i];
		if (obj[key] == null) obj[key] = dloc[key];
		else break;
	}

	var str = obj.pathname || "";
	if (qstr) str += '?' + qstr;
	if (obj.hash) str += '#' + obj.hash;
	if (!relative) {
		str = obj.protocol + '//' + obj.hostname + canonPort(obj) + str;
	}
	return str;
};

exports.sameDomain = function(a, b) {
	if (typeof a == "string") a = exports.parse(a);
	if (typeof b == "string") b = exports.parse(b);
	var loc = document.location;
	var pr = loc.protocol;
	var hn = loc.hostname;
	var po = loc.port;
	return (a.protocol || pr) == (b.protocol || pr) && (a.hostname || hn) == (b.hostname || hn) && (a.port || po) == (b.port || po);
};

exports.samePathname = function(a, b) {
	if (typeof a == "string") a = exports.parse(a);
	if (typeof b == "string") b = exports.parse(b);
	if (exports.sameDomain(a, b)) {
		return a.pathname == b.pathname;
	} else {
		return false;
	}
};

exports.sameQuery = function(a, b) {
	if (typeof a == "string") a = exports.parse(a);
	if (typeof b == "string") b = exports.parse(b);
	var aquery = searchToQuery(a.query || a.search);
	var bquery = searchToQuery(b.query || b.search);
	return queryToString(aquery) == queryToString(bquery);
};

exports.samePath = function(a, b) {
	if (typeof a == "string") a = exports.parse(a);
	if (typeof b == "string") b = exports.parse(b);
	if (exports.samePathname(a, b)) {
		return exports.sameQuery(a, b);
	} else {
		return false;
	}
};

function canonPort(obj) {
	var port = obj.port;
	if (!port) return '';
	var proto = obj.protocol;
	if ((port == 80 && proto == "http:") || (port == 443 && proto == "https:")) {
		return '';
	} else {
		return ':' + port;
	}
}

function searchToQuery(obj) {
	var query = {};
	if (typeof obj == "string") {
		obj = new URLSearchParams(obj);
	}
	if (obj != null && obj.forEach) {
		obj.forEach(function(val, key) {
			var cur = query[key];
			if (cur) {
				if (Array.isArray(cur)) cur.push(val);
				else query[key] = [cur, val];
			} else {
				query[key] = val;
			}
		});
	} else {
		query = obj;
	}
	return query;
}

function queryToSearch(query, obj, prefix) {
	if (!obj) obj = new URLSearchParams();
	Object.keys(query).sort(function (a, b) {
		return a[0].localeCompare(b[0]);
	}).forEach(function(key) {
		var val = query[key];
		if (prefix) key = prefix + '.' + key;
		if (!Array.isArray(val)) val = [val];
		val.forEach(function(val) {
			if (val === undefined) return;
			if (val == null) val = '';
			if (typeof val == "object") queryToSearch(val, obj, key);
			else obj.append(key, val);
		});
	});
	return obj;
}

function queryToString(query) {
	return queryToSearch(query).toString();
}
