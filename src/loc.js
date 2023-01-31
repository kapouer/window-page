import { parse, format } from './query';

export default class Loc extends URL {
	#query;

	constructor(str) {
		const dloc = document.location;
		if (typeof str == "string" || str instanceof URL) {
			super(str, dloc);
		} else {
			super(dloc);
			if (str) Object.assign(this, str);
		}
		this.search = super.search;
	}

	get search() {
		super.search = format(this.#query);
		return super.search;
	}

	set search(str) {
		super.search = str;
		this.#query = parse(str);
	}

	get query() {
		return this.#query;
	}

	set query(obj = {}) {
		super.search = format(obj);
		this.#query = obj;
	}

	sameDomain(b) {
		const a = this;
		if (typeof b == "string") b = new URL(b, document.location);
		return ['protocol', 'hostname', 'port'].every(
			key => a[key] == b[key]
		);
	}

	samePathname(b) {
		const a = this;
		if (typeof b == "string") b = new URL(b, document.location);
		if (a.sameDomain(b)) {
			return a.pathname == b.pathname;
		} else {
			return false;
		}
	}

	sameQuery(b) {
		const a = this;
		if (typeof b == "string") b = new URL(b, document.location);
		return a.search == b.search;
	}

	samePath(b) {
		const a = this;
		if (typeof b == "string") b = new URL(b, document.location);
		if (a.samePathname(b)) {
			return a.sameQuery(b);
		} else {
			return false;
		}
	}

	sameHash(b) {
		if (typeof b == "string") b = new URL(b, document.location);
		return this.hash == b.hash;
	}

	toString() {
		const abs = new URL("/", document.location);
		if (this.sameDomain(abs)) {
			return this.pathname + this.search + this.hash;
		} else {
			return super.toString();
		}
	}
}
