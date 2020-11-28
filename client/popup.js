let _background;
const getBackground = async function() {
    if (_background) {
        return _background;
    }
    return new Promise((resolve, reject) => {
        return chrome.runtime.getBackgroundPage((b) => {
            _background = b;
            return resolve(_background);
        });
    });
};

const sendHistory = async function(li, img, game_id) {
    const background = await getBackground();
    li.appendChild(document.createElement('br'));
    const div = document.createElement('div');
    div.innerText = 'Getting History...';
    const progress = document.createElement('progress');
    li.appendChild(div);
    li.appendChild(progress);
    await background.getHistory(game_id, 0, (done, total) => {
        progress.setAttribute('max', total);
        progress.setAttribute('value', done);
    });
    div.innerText = 'Sending History...';
    progress.removeAttribute('value');
    await background.sendHistory(game_id);
    li.removeChild(progress);
    li.removeChild(div);
    img.src = '/check.png';
};

const fillOut = async function () {
    const username_el = document.getElementById('username');
    const background = await getBackground();
    const user_id = await background.getUserId();
    const user_id_el = document.getElementById('username');
    if (!user_id) {
        user_id_el.innerText = 'Not Logged In';
        return;
    }
    user_id_el.innerText = user_id;

    const finished_game_ids = await background.getFinishedGameIds();
    const games_list_ul = document.getElementById('games-list');
    let count = 0;
    for (const [game_id, title] of finished_game_ids.entries()) {
        if (count >= 10) {
            break;
        }
        const rules = await background.getRules(game_id);
        if (rules.fog === '0') {
            continue;
        }
        const li = document.createElement('li');
        const a = document.createElement('a');
        const img = document.createElement('img');
        img.src = '/spinner.svg';
        img.height = '16px';
        a.innerText = title;
        a.href = `http://warfish.net/war/play/game?gid=${game_id}`;
        a.target = '_blank';
        li.appendChild(a);
        li.appendChild(img);
        games_list_ul.appendChild(li);
        background.hasHistory(game_id).then(has_history => {
            if (has_history) {
                img.src = '/check.png';
            } else {
                img.src = '/up-arrow.png';
                const click_func = () => {
                    img.removeEventListener('click', click_func);
                    sendHistory(li, img, game_id);
                };
                img.addEventListener('click', click_func);
            }
        });
        count++;
    }
};
fillOut();