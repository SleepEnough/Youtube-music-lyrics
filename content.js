// ========================================
// YTM Lyrics
// YouTube Music 歌曲資訊
// ========================================

// ========================================
// 請 Background 開啟歌詞視窗
// ========================================
function openLyricsWindow() {
    chrome.runtime.sendMessage({
        type:
            "openLyricsWindow"
    });
}

// ========================================
// 記錄上一首歌曲
// ========================================
let lastSongTitle = "";


// ========================================
// 記錄目前是哪一句歌詞
// ========================================
let lastLyric = null;


// ========================================
// 目前正在使用的歌詞
// ========================================
let currentLyrics = [];

// ========================================
// 目前歌曲的 LRCLIB 候選歌詞
// ========================================
//
// candidates：所有 LRCLIB 搜尋結果
// selectedCandidate：目前正在使用的候選
//
// 這些資料主要提供給歌詞視窗的
// 候選歌詞選單使用。
// ========================================
let lyricCandidates = [];
let selectedLyricCandidate = null;

// ========================================
// 目前正在載入哪首歌
// ========================================
let loadedSongTitle = "";


// ========================================
// 給每次載入歌詞一個「編號」
// ========================================
let lyricsLoadId = 0;

let pagePlayerCurrentTime = null;
let pagePlayerState = null;

let lyricTimeOffset = 0;

window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (
        !event.data ||
        event.data.type !== "YTM_LYRICS_PLAYER_TIME"
    ) {
        return;
    }

    pagePlayerCurrentTime =
        typeof event.data.currentTime === "number"
            ? event.data.currentTime
            : null;

    pagePlayerState =
        typeof event.data.playerState === "number"
            ? event.data.playerState
            : null;
});

// ========================================
// 取得目前歌曲資訊
// ========================================
function getSongInfo() 
{
    // 找到歌曲標題
    const titleElement =
        document.querySelector(
            "ytmusic-player-bar .title"
        );

    // 如果還沒找到歌曲
    if (!titleElement) {
        return null;
    }

    // 歌曲名稱
    const title =
        titleElement.textContent.trim();

    // 找到播放器
    const playerBar =
        titleElement.closest(
            "ytmusic-player-bar"
        );

    // 找到歌手
    const bylineElement =
        playerBar?.querySelector(
            ".byline"
        );

    // 預設歌手
    let artist = "未知歌手";

    // 如果找到歌手
    if (bylineElement) {
        const links =
            bylineElement.querySelectorAll(
                "a"
            );

        // 第一個連結通常是歌手
        if (links.length > 0) {
            artist =
                links[0]
                    .textContent
                    .trim();
        }
    }

    // 找到播放器
    const video =
        document.querySelector(
            "video"
        );

    const moviePlayer =
        document.getElementById(
            "movie_player"
        );

    // 如果播放器還沒出現
    if (!video && !moviePlayer) {
        return null;
    }

    const progressBar = document.querySelector(
        "tp-yt-paper-slider#progress-bar"
    );

    const progressCurrentTime = progressBar
        ? Number(
            progressBar.getAttribute(
                "aria-valuenow"
            )
        )
        : null;

    const progressDuration = progressBar
        ? Number(
            progressBar.getAttribute(
                "aria-valuemax"
            )
        )
        : null;

    let playerCurrentTime =
        pagePlayerCurrentTime;

    // ========================================
    // 🎯 currentTime fallback
    //
    // ① movie_player.getCurrentTime()
    // ② progressBar aria-valuenow
    // ③ video.currentTime
    // ========================================

    let currentTime = null;

    if (Number.isFinite(playerCurrentTime)) {

        currentTime = playerCurrentTime;

    } else if (
        Number.isFinite(progressCurrentTime)
    ) {

        currentTime = progressCurrentTime;

    } else if (
        video &&
        Number.isFinite(video.currentTime)
    ) {

        currentTime = video.currentTime;
    }

    // ========================================
    // 🎯 duration fallback
    //
    // 優先使用 progressBar 的 duration，
    // 因為自然換歌時 video.duration 可能仍是舊歌曲。
    // ========================================

    let duration = null;

    if (Number.isFinite(progressDuration)) {
        duration = progressDuration;
    } else if (
        video &&
        Number.isFinite(video.duration)
    ) {
        duration = video.duration;
    }

    // 回傳歌曲資料
    return {
        title: title,
        artist: artist,

        // 🎯 使用 YouTube Music Player API 的精確時間
        currentTime: currentTime,
        duration: duration,

    };
}

function parsePlainLyrics(text) {
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== "")
        .map(line => ({
            time: null,
            text: line
        }));
}

// ========================================
// 解析 LRC 歌詞
// ========================================
function parseLRC(lrcText) 
{
    console.log("🧪 parseLRC() 開始解析");

    // 如果沒有歌詞內容
    if (!lrcText) {
        console.log("⚠️ LRC 內容是空的");
        return [];
    }

    // 每一行分開
    const lines = lrcText.split(/\r?\n/);

    // 存放解析後的歌詞
    const lyrics = [];

    // 一行一行處理
    for (const line of lines) {
        // 找時間標籤
        // 例如：
        // [00:47.00]受傷的心不想言語

        const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);

        // 不是歌詞時間格式
        if (!match) {
             continue;
        }

        // 分鐘
        const minutes =
            parseInt(
                match[1],
                10
            );


        // 秒數
        const seconds =
            parseFloat(
                match[2]
            );


        // 歌詞文字
        const text =
            match[3].trim();

        if(!text){
            continue;
        }


        // 分鐘 + 秒
        // 統一轉換成秒數
        const time =
            minutes * 60 +
            seconds;


        // 加入歌詞
        lyrics.push({

            time: time,

            text: text
        });
    }


    // 按照時間排序
    lyrics.sort(
        (a, b) =>
            a.time - b.time
    );


    console.log(
        "🧪 parseLRC() 完成，共",
        lyrics.length,
        "句"
    );


    return lyrics;
}

// ========================================
// 找出目前應該播放哪一句歌詞
// ========================================
function findCurrentLyric(
    currentTime,
    lyrics
) {

    // 如果沒有歌詞
    if (
        !lyrics ||
        lyrics.length === 0
    ) {

        return null;
    }


    // 目前找到的歌詞
    let currentLyric = null;


    // 一句一句檢查
    for (const lyric of lyrics) {

        // 如果這一句已經開始
        if (
            lyric.time <= currentTime
        ) {

            currentLyric = lyric;

        } else {

            // 後面的時間更晚
            // 不需要繼續找
            break;
        }
    }


    return currentLyric;
}

// ========================================
// 向 Background 取得歌詞
// ========================================
async function loadLyricsForSong(
    songTitle,
    artistName,
    albumName,
    duration
) {
    // ====================================
    // 每次載入都建立新的 Load ID
    // ====================================

    const thisLoadId = ++lyricsLoadId;

    console.log(
        "🔍 正在尋找歌詞：",
        songTitle,
        "Load ID：",
        thisLoadId
    );

    try {

        // ====================================
        // 傳送搜尋要求
        // ====================================

        console.log(
            "📤 content.js 準備送 searchLyrics 到 Background",
            {
                songTitle,
                artistName,
                albumName,
                duration,
                loadId: thisLoadId
            }
        );

        response = await new Promise((resolve) => {

            chrome.runtime.sendMessage(
                {
                    type: "searchLyrics",
                    songTitle,
                    artistName,
                    albumName,
                    duration,
                    loadId: thisLoadId
                },
                (result) => {
        
                    const error = chrome.runtime.lastError;
        
                    if (error) {
                        console.error(
                            "❌ chrome.runtime.sendMessage 發生錯誤：",
                            error.message
                        );
        
                        resolve(null);
                        return;
                    }
        
                    console.log(
                        "📥 callback 收到 Background 回應：",
                        result
                    );
        
                    resolve(result);
                }
            );
        
        });
        // ====================================
        // ★ 最重要
        //
        // 先確認是不是最新請求
        // ====================================
        // ① 先判斷是不是目前歌曲的搜尋結果
        if (thisLoadId !== lyricsLoadId) {
            console.log(
                "⚠️ 這是舊的歌詞搜尋結果，直接忽略：",
                songTitle,
                "Load ID：",
                thisLoadId,
                "目前 Load ID：",
                lyricsLoadId
            );
            return;
        }

        // ② 如果 Background 沒有回應
        if (!response) {
            console.error(
                "❌ Background 沒有回傳搜尋結果：",
                songTitle,
                "Load ID：",
                thisLoadId
            );
            return;
        }

        // ③ 如果 Background 回傳了 loadId，但不是目前這次
        if (response.loadId !== thisLoadId) {
            console.error(
                "❌ Background 回傳了錯誤的 Load ID：",
                songTitle,
                "搜尋 Load ID：",
                thisLoadId,
                "Background Load ID：",
                response.loadId
            );
            return;
        }

        // ====================================
        // 找不到歌詞
        //
        // 注意：
        // 這裡現在已經確定是最新請求
        // ====================================

        if (!response || !response.success) {
            console.log(
                "❌ 找不到對應歌詞：",
                songTitle,
                "Load ID：",
                thisLoadId
            );

            currentLyrics = [];

            loadedSongTitle = "";

            return;
        }

        // ====================================
        // 保存 LRCLIB 候選歌詞
        // ====================================
        //
        // Local LRC 時 candidates 會是空陣列。
        // LRCLIB 搜尋時則會包含所有候選。
        // ====================================
        if (
            Array.isArray(response.candidates)
        ) {
            lyricCandidates =
                response.candidates;
        } else {
            lyricCandidates = [];
        }

        // ====================================
        // 保存目前自動選中的候選
        // ====================================
        selectedLyricCandidate =
            response.selectedCandidate || null;

        console.log(
            "📚 收到 LRCLIB 候選：",
            lyricCandidates.length,
            "筆"
        );

        console.log(
            "🎯 目前選中的 LRCLIB 候選：",
            selectedLyricCandidate
        );

        // ====================================
        // 找到歌詞
        // ====================================

        console.log(
            "🎵 找到歌詞來源：",
            response.source
        );

        console.log(
            "📄 歌詞檔案：",
            response.fileName
        );

        console.log(
            "📄 收到歌詞文字長度：",
            response.text?.length
        );

        // ====================================
        // 解析 LRC
        // ====================================
        let parsedLyrics = [];

        // ========================================
        // 判斷歌詞類型
        // ========================================
        if (response.lyricType === "plain") {

            console.log("📝 content.js 收到一般歌詞，不解析時間標籤");

            parsedLyrics = parsePlainLyrics(response.text);
        } else {

            console.log("🧪 content.js 開始解析新歌 LRC");

            parsedLyrics = parseLRC(response.text);

            console.log(
                "🎵 新歌歌詞解析完成，共",
                parsedLyrics.length,
                "句"
            );
        }

        // ========================================
        // 確認是否真的有歌詞
        // ========================================
        if (parsedLyrics.length === 0) {
            console.log(
                "⚠️ 歌詞存在，但沒有解析出任何內容：",
                songTitle
            );
            return;
        }

        // ========================================
        // 更新目前正在使用的歌詞
        // ========================================
        currentLyrics = parsedLyrics;

        console.log(
            "💾 currentLyrics 已更新，共",
            currentLyrics.length,
            "句"
        );

        // ====================================
        // 傳送歌詞給 Background
        // ====================================

        console.log(
            "📤 content.js 準備呼叫 sendLyricsToWindow()"
        );

        const sent =
            await sendLyricsToWindow();

        console.log(
            "📬 updateLyrics 傳送結果：",
            sent
        );

        // ====================================
        // 傳送完成後再次確認歌曲
        // ====================================

        if (
            thisLoadId !== lyricsLoadId
        ) {

            console.log(
                "⚠️ updateLyrics 完成時歌曲已經改變：",
                songTitle
            );

            return;
        }

        // ====================================
        // 記錄目前歌曲
        // ====================================

        loadedSongTitle =
            songTitle;

        // ====================================
        // 清除上一句
        // ====================================

        lastLyric =
            null;

        console.log(
            "✅ 新歌歌詞載入流程完成：",
            songTitle,
            "Load ID：",
            thisLoadId
        );

    } catch (error) {

        console.error(
            "❌ 載入歌詞失敗：",
            songTitle,
            error
        );

        // ====================================
        // ★ 舊請求不能影響目前歌曲
        // ====================================

        if (
            thisLoadId !== lyricsLoadId
        ) {

            console.log(
                "⚠️ 舊請求發生錯誤，忽略：",
                songTitle
            );

            return;
        }

        currentLyrics = [];

        loadedSongTitle = "";
    }
}

// ========================================
// 每 0.1 秒檢查一次
// 使用 setTimeout 避免 async 重疊
// ========================================
async function checkSongAndLyric() {

    // ====================================
    // 取得歌曲
    // ====================================
    const song = getSongInfo();

    // ====================================
    // 歌曲資料還沒準備好
    // ====================================
    if (!song) {
        console.log("歌曲資料還沒準備好");
        setTimeout(checkSongAndLyric, 100);
        return;
    }
    let songChanged = false;

    // ====================================
    // 偵測換歌
    // ====================================
    if (song.title !== lastSongTitle) {
        // ====================================
        // 記錄新歌曲
        // ====================================
        lastSongTitle = song.title;
        songChanged = true;
        
        // ====================================
        // 換歌時重設歌詞同步偏移
        // ====================================
        lyricTimeOffset = 0;

        console.log("🎚️ 換歌，歌詞同步偏移重設為：0.0 秒");

        // ====================================
        // ★ 立刻讓舊的歌詞搜尋失效
        // ====================================
        console.log("🔄 歌曲改變，舊歌詞搜尋全部失效");
        console.log("🎵 找到新歌曲：", song.title);

        // ====================================
        // 清除上一首歌曲
        // ====================================
        currentLyrics = [];
        lastLyric = null;
        loadedSongTitle = "";

        // ====================================
        // 重置歌詞同步偏移
        // ====================================
        lyricTimeOffset = 0;
        
        console.log("🎚️ 歌曲變更，歌詞同步偏移已重置：0.0 秒");

        // ====================================
        // 清除上一首歌曲的 LRCLIB 候選
        // ====================================
        lyricCandidates = [];
        selectedLyricCandidate = null;

        // ====================================
        // 通知 Background
        // ====================================
        chrome.runtime.sendMessage({
            type:
                "songChanged"
        });

        // ====================================
        // 開啟歌詞視窗
        // ====================================
        openLyricsWindow();

        // ====================================
        // 載入新歌歌詞
        // ====================================
        await loadLyricsForSong(
            song.title,
            song.artist,
            song.albumName,
            song.duration
        );
    }

    if(!songChanged){
        // ====================================
        // 找目前歌詞
        // ====================================
        const lyricCurrentTime =
            song.currentTime + lyricTimeOffset;

        const currentLyric = findCurrentLyric(lyricCurrentTime, currentLyrics);

        // ====================================
        // 如果找到歌詞
        // ====================================
        if (currentLyric) {
            // ==================================
            // 跟上一句不同
            // ==================================
            if (!lastLyric || currentLyric.time !== lastLyric.time) {
                lastLyric = currentLyric;
                // console.log("🎵 目前歌詞：", currentLyric.text);
                sendCurrentLyricToWindow(currentLyric);
            }
        }
    }
    // ====================================
    // 100ms 後再檢查
    // ====================================
    setTimeout(checkSongAndLyric, 100);
}

// ========================================
// 啟動歌曲 / 歌詞偵測
// ========================================
checkSongAndLyric();

// ========================================
// 傳送歌詞給歌詞視窗
// ========================================
async function sendLyricsToWindow() {

    console.log(
        "📤 準備把歌詞送給 Background，共",
        currentLyrics.length,
        "句"
    );

    console.log(
        "📤 第一行歌詞：",
        currentLyrics[0]
    );

    try {
        await chrome.runtime.sendMessage({
            type:
                "updateLyrics",
            lyrics:
                currentLyrics
        });

        console.log(
            "✅ updateLyrics 已送出"
        );

        return true;

    } catch (error) {
        console.error(
            "❌ updateLyrics 傳送失敗：",
            error
        );
        return false;
    }

}

// ========================================
// 傳送目前播放到哪一句
// ========================================
function sendCurrentLyricToWindow(
    currentLyric
) {
    chrome.runtime.sendMessage({
        type:
            "updateCurrentLyric",

        lyric:
            currentLyric
    });
}

// ========================================
// 使用者手動切換 LRCLIB 歌詞
// ========================================
//
// 功能：
// 收到 lyrics.js / Background 指定的候選 ID
// 後，將該候選歌詞解析並直接替換
// currentLyrics。
//
// 注意：
// 這裡不會重新搜尋 LRCLIB。
// 直接使用之前搜尋得到的候選資料。
// ========================================
function selectLyricCandidate(candidateId) {
    console.log(
        "🎯 要切換 LRCLIB 歌詞，Candidate ID：",
        candidateId
    );

    // ====================================
    // 確認目前有候選歌詞
    // ====================================
    if (
        !Array.isArray(lyricCandidates) ||
        lyricCandidates.length === 0
    ) {
        console.error(
            "❌ 目前沒有可選擇的 LRCLIB 候選"
        );

        return false;
    }

    // ====================================
    // 找到使用者選擇的候選
    // ====================================
    const candidate =
        lyricCandidates.find(
            (item) =>
                String(item.id) ===
                String(candidateId)
        );

    // ====================================
    // 找不到候選
    // ====================================
    if (!candidate) {
        console.error(
            "❌ 找不到指定的 LRCLIB 候選：",
            candidateId
        );

        return false;
    }

    console.log(
        "🎵 使用者選擇候選：",
        candidate
    );

    // ====================================
    // 判斷使用哪種歌詞
    // ====================================
    let lyricText = null;
    let lyricType = null;

    // 優先同步歌詞
    if (
        candidate.syncedLyrics
    ) {
        lyricText =
            candidate.syncedLyrics;

        lyricType = "synced";
    }

    // 沒有同步歌詞才使用一般歌詞
    else if (
        candidate.plainLyrics
    ) {
        lyricText =
            candidate.plainLyrics;

        lyricType = "plain";
    }

    // ====================================
    // 沒有歌詞內容
    // ====================================
    if (!lyricText) {
        console.error(
            "❌ 選擇的候選沒有歌詞內容：",
            candidate
        );

        return false;
    }

    // ====================================
    // 解析歌詞
    // ====================================
    let parsedLyrics = [];

    if (
        lyricType === "plain"
    ) {

        // ==================================
        // 一般歌詞沒有時間標籤
        // ==================================
        const lines =
            lyricText
                .split(/\r?\n/)
                .map(
                    line =>
                        line.trim()
                )
                .filter(
                    line =>
                        line !== ""
                );

        parsedLyrics =
            lines.map(
                (text) => ({
                    time: null,
                    text: text
                })
            );

    } else {

        // ==================================
        // 同步歌詞解析 LRC
        // ==================================
        parsedLyrics =
            parseLRC(
                lyricText
            );
    }

    // ====================================
    // 確認解析成功
    // ====================================
    if (
        parsedLyrics.length === 0
    ) {
        console.error(
            "❌ 選擇的候選無法解析出歌詞：",
            candidate
        );

        return false;
    }

    // ====================================
    // 更新目前歌詞
    // ====================================
    currentLyrics =
        parsedLyrics;

    // ====================================
    // 記錄目前選中的候選
    // ====================================
    selectedLyricCandidate =
        candidate;

    // ====================================
    // 清除上一句
    //
    // 這樣下一次檢查目前播放時間時，
    // 會重新找目前應該顯示的歌詞。
    // ====================================
    lastLyric = null;

    console.log(
        "💾 currentLyrics 已切換，共",
        currentLyrics.length,
        "句"
    );

    console.log(
        "🎯 selectedLyricCandidate 已更新：",
        selectedLyricCandidate
    );

    // ====================================
    // 立刻把新歌詞送到歌詞視窗
    // ====================================
    sendLyricsToWindow();

    // ====================================
    // 立即根據目前播放器時間重新找歌詞
    // ====================================
    const song =
        getSongInfo();

    if (
        song &&
        Number.isFinite(
            song.currentTime
        )
    ) {
        const lyricCurrentTime =
            song.currentTime + lyricTimeOffset;

        const newCurrentLyric =
            findCurrentLyric(
                lyricCurrentTime,
                currentLyrics
            );

        if (newCurrentLyric) {

            lastLyric =
                newCurrentLyric;

            sendCurrentLyricToWindow(
                newCurrentLyric
            );

        } else {

            console.log(
                "ℹ️ 新歌詞在目前播放時間沒有對應歌詞"
            );
        }
    }

    return true;
}

// ========================================
// 接收 Background 傳來的候選歌詞切換要求
// ========================================
chrome.runtime.onMessage.addListener(
    (message) => {

        // ====================================
        // 使用者選擇新的 LRCLIB 歌詞
        // ====================================
        if (message.type === "selectLyricCandidate") {

            console.log(
                "📨 content.js 收到候選切換要求：",
                message
            );

            selectLyricCandidate(
                message.candidateId
            );
        }

        if (message.type === "setLyricTimeOffset") {
            const offset =
                Number(message.offset);

            if (!Number.isFinite(offset)) {
                return;
            }

            lyricTimeOffset = offset;

            console.log(
                "🎚️ 歌詞同步偏移：",
                lyricTimeOffset.toFixed(1),
                "秒"
            );

            return;
        }
    }
);

// ========================================
// 接收歌詞跳轉要求並傳送至播放器
// ========================================
chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (message.type !== "seekToLyricTime") {
            return;
        }

        const time = Number(message.time);

        if (
            !Number.isFinite(time) ||
            time < 0
        ) {
            return;
        }

        window.postMessage(
            {
                type: "YTM_LYRICS_SEEK",
                time
            },
            "*"
        );
    }
);

console.log("🚀 YTM Lyrics content.js 已載入");