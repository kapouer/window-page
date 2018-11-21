module.exports = Tracker;

function Tracker() {
	this.listeners = [];
	this.nodes = [];

}
Tracker.prototype.start = function() {
	var list = this.listeners;
	var nodes = [];

	Array.prototype.forEach.call(arguments, function(node) {
		var _meth = node.addEventListener;
		nodes.push({node: node, meth: _meth});
		node.addEventListener = function(name, fn, opts) {
			list.push({
				emitter: node,
				name: name,
				fn: fn,
				opts: opts
			});
			return _meth.call(this, name, fn, opts);
		};
	});
};
Tracker.prototype.stop = function() {
	this.listeners.forEach(function(obj) {
		obj.emitter.removeEventListener(obj.name, obj.fn, obj.opts);
	});
	this.listeners = [];
	this.nodes.forEach(function(obj) {
		obj.node.addEventListener = obj._meth;
	});
	this.nodes = [];
};

