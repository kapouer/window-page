import { parse, format } from './query';

export default class Loc {
	constructor(str) {
		const dloc = document.location;
		const it = this;
		let loc;
		if (str == null || str == "") {
			loc = dloc;
		} else if (typeof str == "string") {
			loc = new URL(str, dloc);
		} else {
			loc = str;
		}
		for (const key of ['referrer', 'port', 'hostname', 'protocol', 'pathname']) {
			if (loc[key]) it[key] = loc[key];
		}
		it.query = loc.query ? Object.assign({}, loc.query) : parse(loc.search) || {};

		if (!it.pathname) {
			it.pathname = dloc.pathname;
		} else if (it.pathname[0] != "/") {
			it.pathname = "/" + it.pathname;
		}

		let hash = loc.hash || (str == null ? dloc.hash : null);
		if (hash && hash[0] == "#") hash = hash.substring(1);
		if (hash != null && hash != '') it.hash = hash;

		if (it.sameDomain(dloc)) {
			delete it.port;
			delete it.hostname;
			delete it.protocol;
		} else {
			if (!it.hostname) {
				it.hostname = loc.hostname;
				if (!it.port) it.port = loc.port;
			}
			if (!it.protocol) it.protocol = loc.protocol;
			if (it.#canonPort()) {
				delete it.port;
			}
		}
	}
	sameDomain(b) {
		const a = this;
		if (typeof b == "string") b = new Loc(b);
		const loc = document.location;
		const pr = loc.protocol;
		const hn = loc.hostname;
		const po = loc.port;
		return (a.protocol || pr) == (b.protocol || pr) && (a.hostname || hn) == (b.hostname || hn) && (a.port || po) == (b.port || po);
	}

	samePathname(b) {
		const a = this;
		if (typeof b == "string") b = new Loc(b);
		if (a.sameDomain(b)) {
			return a.pathname == b.pathname;
		} else {
			return false;
		}
	}

	sameQuery(b) {
		const a = this;
		if (typeof b == "string") b = new Loc(b);
		return format(a.query) == format(b.query);
	}

	samePath(b) {
		const a = this;
		if (typeof b == "string") b = new Loc(b);
		if (a.samePathname(b)) {
			return a.sameQuery(b);
		} else {
			return false;
		}
	}

	sameHash(b) {
		if (typeof b == "string") b = new Loc(b);
		return this.hash == b.hash;
	}

	#canonPort() {
		const port = this.port;
		if (!port) return '';
		const proto = this.protocol;
		if ((port == 80 && proto == "http:") || (port == 443 && proto == "https:")) {
			return '';
		} else {
			return ':' + port;
		}
	}

	toString() {
		const dloc = document.location;
		const it = this;
		if (it.path) {
			const locPath = new Loc(it.path);
			it.pathname = locPath.pathname;
			it.query = locPath.query;
			it.hash = locPath.hash;
			delete it.path;
		}
		let qstr;
		if (it.query) qstr = format(it.query);
		else if (it.search) qstr = it.search[0] == "?" ? it.search.substring(1) : it.search;
		it.search = qstr;

		const keys = ["pathname", "search", "hash"];
		const relative = !it.protocol && !it.hostname && !it.port;
		if (!relative) keys.unshift("protocol", "hostname", "port");

		let key;
		for (let i = 0; i < keys.length; i++) {
			key = keys[i];
			if (it[key] == null) it[key] = dloc[key];
			else break;
		}

		let str = it.pathname || "";
		if (qstr) str += '?' + qstr;
		if (it.hash) str += '#' + it.hash;
		if (!relative) {
			str = it.protocol + '//' + it.hostname + it.#canonPort() + str;
		}
		return str;
	}
}
