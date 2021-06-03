exports.parse = parse;
exports.format = format;



function fromParams(params, query, head) {
	if (params == null || !params.forEach) return params;

	var prefixes = {};
	var lastKey, lastIndex = null, local = {};
	params.forEach(function (val, key) {
		var list = key.split('.');
		if (list.length == 1) {
			var fkey = head ? head + "." + key : key;
			if (lastIndex !== null) {
				if (query[head][lastIndex][key] !== undefined) {
					query[head].push({[key]: val});
					lastIndex += 1;
				} else {
					query[head][lastIndex][key] = val;
				}
			} else if (query[fkey] === undefined) {
				local[key] = query[fkey] = val;
			} else if (Array.isArray(query[fkey])) {
				query[fkey].push(val);
			} else if (!lastKey || lastKey == fkey) {
				local[key] = query[fkey] = [query[fkey], val];
			} else if (!query[head]) {
				query[head] = [local, { [key]: val }];
				for (var lkey in local) delete query[head ? head + "." + lkey : lkey];
				lastIndex = 1;
			}
			lastKey = fkey;
		} else {
			var prefix = list.shift();
			if (!prefixes[prefix]) prefixes[prefix] = new URLSearchParams();
			prefixes[prefix].append(list.join('.'), val);
		}
	});

	Object.keys(prefixes).forEach(function (prefix) {
		fromParams(prefixes[prefix], query, head ? head + "." + prefix : prefix);
	});

	return query;
}


function parse(str) {
	var params = typeof str == "string" ? new URLSearchParams(str) : str;
	return fromParams(params, {});
}

function toParams(query, params, prefix) {
	Object.keys(query).sort(function (a, b) {
		return a[0].localeCompare(b[0]);
	}).forEach(function(key) {
		var val = query[key];
		if (prefix) key = prefix + '.' + key;
		if (!Array.isArray(val)) val = [val];
		val.forEach(function(val) {
			if (val === undefined) return;
			if (val == null) val = '';
			if (typeof val == "object") toParams(val, params, key);
			else params.append(key, val);
		});
	});
	return params;
}

function format(query) {
	return toParams(query, new URLSearchParams()).toString();
}
