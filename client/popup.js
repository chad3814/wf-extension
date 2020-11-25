const parseQueryParams = function (qs) {
    if (qs.charAt(0) === '?') {
        qs.substr(1);
    }
    const ret = {};
    qs.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        ret[decodeURIComponent(key)] = decodeURIComponent(value);
    });
    return ret;
};

fetch('http://warfish.net/war/settings/account', {
    redirect: 'manual'
}).then(res => {
    const username_el = document.getElementById('username');
    if (!res.ok) {
        username_el.innerText = 'You are not logged in';
        return;
    }
    return res.text();
}).then(html => {
    const dom_parser = new DOMParser();
    const doc = dom_parser.parseFromString(html, 'text/html');
    const anchor = [...doc.querySelectorAll('a')].filter(a => a.innerText === 'View your profile')[0];
    if (!anchor) {
        throw new Error('Failed to find profile link');
    }
    const params = parseQueryParams(anchor.search);
    const username_el = document.getElementById('username');
    username_el.innerText = params.pid;
}).catch(err => {
    const div = document.createElement('div');
    div.innerText = err;
    const username_el = document.getElementById('username');
    username_el.innerText = 'An error occurred';
    document.body.appendChild(div);
});
