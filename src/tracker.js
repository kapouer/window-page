module.exports = Tracker;

function Tracker() {
	this.list = [];
}
Tracker.prototype.start = function() {
	var list = this.list;
	Array.prototype.forEach.call(arguments, function(node) {
		var Proto = node.constructor.prototype;
		if (node.addEventListener != Proto.addEventListener) return;
		node.addEventListener = function(name, fn, opts) {
			list.push({
				emitter: node,
				name: name,
				fn: fn,
				opts: opts
			});
			return Proto.addEventListener.call(this, name, fn, opts);
		};
	});
};
Tracker.prototype.stop = function() {
	this.list.forEach(function(obj) {
		obj.emitter.removeEventListener(obj.name, obj.fn, obj.opts);
	});
	this.list = [];
};

