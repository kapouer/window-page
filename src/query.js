function fromParams(params, query, head) {
	if (params == null || !params.forEach) return params;

	const prefixes = {};
	const local = {};
	let lastKey, lastIndex = null;
	params.forEach((val, key) => {
		const list = key.split('.');
		if (list.length == 1) {
			const fkey = head ? head + "." + key : key;
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
				for (const lkey in local) delete query[head ? head + "." + lkey : lkey];
				lastIndex = 1;
			}
			lastKey = fkey;
		} else {
			const prefix = list.shift();
			if (!prefixes[prefix]) prefixes[prefix] = new URLSearchParams();
			prefixes[prefix].append(list.join('.'), val);
		}
	});

	for (const prefix of Object.keys(prefixes)) {
		fromParams(prefixes[prefix], query, head ? head + "." + prefix : prefix);
	}

	return query;
}


export function parse(str) {
	if (!str) return {};
	const params = typeof str == "string" ? new URLSearchParams(str) : str;
	return fromParams(params, {});
}

function toParams(query, params, prefix) {
	const keys = Object.keys(query).sort((a, b) => {
		return a[0].localeCompare(b[0]);
	});
	for (let key of keys) {
		let vals = query[key];
		if (prefix) key = prefix + '.' + key;
		if (!Array.isArray(vals)) vals = [vals];
		for (let val of vals) {
			if (val === undefined) break;
			if (val == null) val = '';
			if (typeof val == "object") toParams(val, params, key);
			else params.append(key, val);
		}
	}
	return params;
}

export function format(query) {
	if (!query) return '';
	return toParams(query, new URLSearchParams()).toString();
}
