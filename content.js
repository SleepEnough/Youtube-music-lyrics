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
// 目前正在載入哪首歌
// ========================================

let loadedSongTitle = "";


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


    // 如果播放器還沒出現
    if (!video) {
        return null;
    }


    // 回傳歌曲資料
    return {

        title: title,

        artist: artist,

        currentTime:
            video.currentTime,

        duration:
            video.duration
    };
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
    songTitle
) {

    console.log(
        "🔍 正在尋找歌詞：",
        songTitle
    );


    try {

        // 傳訊息給 background.js
        const response =
            await chrome.runtime.sendMessage({

                type:
                    "searchLyrics",

                songTitle:
                    songTitle
            });


        // ====================================
        // 找不到
        // ====================================

        if (
            !response ||
            !response.success
        ) {

            console.log(
                "❌ 找不到對應歌詞：",
                songTitle
            );


            currentLyrics = [];

            loadedSongTitle = "";

            return;
        }


        // ====================================
        // 找到了
        // ====================================

        console.log(
            "🎵 找到歌詞檔：",
            response.fileName
        );


        // ====================================
        // 解析 LRC
        // ====================================

        currentLyrics =
            parseLRC(
                response.text
            );

        console.log(
            "📖 LRC 原始文字長度：",
            response.text?.length
        );
        
        console.log(
            "📖 LRC 原始內容前 200 字：",
            response.text?.substring(0, 200)
        );


        console.log(
            "🎵 歌詞解析完成，共",
            currentLyrics.length,
            "句"
        );

        // 把歌詞傳給歌詞視窗
        sendLyricsToWindow();

        // 記錄目前歌曲
        loadedSongTitle =
            songTitle;


        // 清除上一句
        lastLyric = null;


    } catch (error) {

        console.error(
            "❌ 載入歌詞失敗：",
            error
        );


        currentLyrics = [];

        loadedSongTitle = "";
    }
}

// ========================================
// 每0.1秒檢查一次
// ========================================

setInterval(
    async () => {

        // 取得歌曲
        const song =
            getSongInfo();


        // 如果歌曲資料還沒準備好
        if (!song) {
            return;
        }


        // ====================================
        // 偵測換歌
        // ====================================

        if (
            song.title !==
            lastSongTitle
        ) {

            // 記錄新歌曲
            lastSongTitle =
                song.title;


            // 清除上一首歌曲的歌詞
            currentLyrics = [];

            lastLyric = null;


            console.log(
                "🎵 找到新歌曲：",
                song.title
            );

            // 開啟歌詞視窗
            openLyricsWindow();

            // 載入這首歌的 LRC
            await loadLyricsForSong(
                song.title
            );
        }


        // ====================================
        // 找目前歌詞
        // ====================================

        const currentLyric =
            findCurrentLyric(
                song.currentTime,
                currentLyrics
            );


        // 如果找到歌詞
        if (currentLyric) {

            // 如果跟上一句不同
            if (
                !lastLyric ||
                currentLyric.time !==
                lastLyric.time
            ) {
                lastLyric =
                    currentLyric;

                console.log(
                    "🎵 目前歌詞：",
                    currentLyric.text
                );

                // 傳送目前歌詞給歌詞視窗
                sendCurrentLyricToWindow(
                    currentLyric
                );
            }
        }

    },
    100
);

// ========================================
// 傳送歌詞給歌詞視窗
// ========================================

function sendLyricsToWindow() {

    console.log(
        "📤 準備把歌詞送給 Background，共",
        currentLyrics.length,
        "句"
    );

    console.log(
        "📤 第一行歌詞：",
        currentLyrics[0]
    );


    chrome.runtime.sendMessage({

        type:
            "updateLyrics",

        lyrics:
            currentLyrics

    })
    .then(() => {
        console.log(
            "✅ updateLyrics 已送出"
        );
    })
    .catch((error) => {
        console.error(
            "❌ updateLyrics 傳送失敗：",
            error
        );
    });
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

console.log(
    "🚀 YTM Lyrics content.js 已載入"
);