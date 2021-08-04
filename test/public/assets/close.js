const nums = {
	setup: 0,
	close: 0
};
const reads = {};
Page.close(checkNums);
Page.setup(checkNums);

function checkNums(state) {
	const stage = state.stage;
	const node = document.querySelector('.' + stage);
	if (!reads[stage]) {
		reads[stage] = true;
		const int = parseInt(node.innerHTML);
		if (!Number.isNaN(int)) nums[stage] = int;
	}
	node.innerHTML = ++nums[stage];
}

const orders = [];

function delay(str, ms) {
	return new Promise(function(resolve) {
		setTimeout(function() {
			orders.push(str);
			resolve();
		}, ms);
	});
}

Page.setup(function(state) {
	if (state.query.close !== undefined) state.finish(function() {
		state.push('/close.html');
	});
	else state.finish(function() {
		return delay("finally", 50).then(function() {
			document.querySelector('.orders').textContent = orders.join(',');
		});
	});
	return delay("setup", 50);
});
Page.setup(function(state) {
	Page.setup(function(state) {
		orders.push("setup21-" + (state.query.close !== undefined));
	});
	return delay("setup2", 20);
});
Page.close(function(state) {
	return delay("close", 10).then(function() {
		document.querySelector('.orders').textContent = orders.join(',');
	});
});
