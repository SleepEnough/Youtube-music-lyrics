// ========================================
// YTM Lyrics - Background
// ========================================

// 目前完整歌詞
let savedLyrics = [];

// 目前播放的歌詞
let savedCurrentLyric = null;

// ========================================
// 歌詞視窗 ID
// ========================================

let lyricsWindowId = null;

// ========================================
// 取得歌詞視窗的 Tab
// ========================================

async function getLyricsWindowTab() {

    if (lyricsWindowId === null) {
        return null;
    }
    try {
        const window =
            await chrome.windows.get(
                lyricsWindowId,
                {
                    populate: true
                }
            );

        if (
            !window.tabs ||
            window.tabs.length === 0
        ) {
            return null;
        }

        return window.tabs[0];

    } catch (error) {

        console.log(
            "⚠️ 無法取得歌詞視窗 Tab：",
            error
        );

        return null;
    }
}

// ========================================
// 安全傳送訊息給歌詞視窗
// ========================================

async function sendMessageToLyricsWindow(message) {
    // ====================================
    // 最多嘗試 10 次
    // ====================================
    const maxRetries = 10;

    // ====================================
    // 每次等待 200ms
    // ====================================
    const retryDelay = 200;

    for (
        let attempt = 1;
        attempt <= maxRetries;
        attempt++
    ) {

        const tab = await getLyricsWindowTab();

        // ====================================
        // 沒有歌詞視窗
        // ====================================
        if (!tab) {
            console.log("⚠️ 目前沒有歌詞視窗 Tab");

            return false;
        }

        // ====================================
        // 歌詞視窗尚未載入
        // ====================================
        if (tab.status !== "complete") {
            console.log(`⏳ 歌詞視窗尚未完成載入，第 ${attempt} 次等待`);

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        retryDelay
                    )
            );

            continue;
        }

        // ====================================
        // 嘗試傳送訊息
        // ====================================
        try {
            await chrome.tabs.sendMessage(
                tab.id,
                message
            );

            console.log("📤 已成功傳送給歌詞視窗：", message.type);

            return true;

        } catch (error) {

            console.log(`⚠️ 歌詞視窗尚未準備好，第 ${attempt} 次嘗試失敗：`, error.message);

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        retryDelay
                    )
            );
        }
    }
    console.error("❌ 多次嘗試後仍無法傳送給歌詞視窗：", message.type);
    return false;
}
// ========================================
// 歌詞視窗位置
// ========================================

let lyricsWindowLeft = null;

let lyricsWindowTop = null;

// ========================================
// IndexedDB 設定
// ========================================

const DB_NAME = "YTM-Lyrics";

const STORE_NAME = "settings";


// ========================================
// 開啟資料庫
// ========================================
function openDatabase() {

    return new Promise((resolve, reject) => {

        const request =
            indexedDB.open(DB_NAME, 1);


        // 第一次建立資料庫
        request.onupgradeneeded = () => {

            const db =
                request.result;


            if (
                !db.objectStoreNames.contains(
                    STORE_NAME
                )
            ) {

                db.createObjectStore(
                    STORE_NAME
                );
            }
        };


        request.onsuccess = () => {

            resolve(
                request.result
            );
        };


        request.onerror = () => {

            reject(
                request.error
            );
        };
    });
}

// ========================================
// 儲存歌詞視窗位置
// ========================================
async function saveLyricsWindowPosition(
    left,
    top
) {

    console.log(
        "💾 儲存歌詞視窗位置：",
        left,
        top
    );

    await chrome.storage.local.set({

        lyricsWindowPosition: {
            left:
                left,
            top:
                top
        }

    });


    console.log(
        "✅ 歌詞視窗位置已儲存"
    );
}

// ========================================
// 儲存歌詞視窗大小
// ========================================
async function saveLyricsWindowSize(
    width,
    height
) {

    console.log(
        "💾 儲存歌詞視窗大小：",
        width,
        height
    );


    await chrome.storage.local.set({

        lyricsWindowSize: {

            width:
                width,

            height:
                height
        }

    });


    console.log(
        "✅ 歌詞視窗大小已儲存"
    );
}

// ========================================
// 讀取歌詞視窗位置
// ========================================
async function loadLyricsWindowPosition() {

    const result =
        await chrome.storage.local.get(
            "lyricsWindowPosition"
        );


    if (
        !result.lyricsWindowPosition
    ) {

        console.log(
            "📍 沒有之前的歌詞視窗位置"
        );


        return null;
    }


    console.log(
        "📍 找到之前的歌詞視窗位置：",
        result.lyricsWindowPosition
    );


    return result.lyricsWindowPosition;
}

// ========================================
// 讀取歌詞視窗大小
// ========================================
async function loadLyricsWindowSize() {

    const result =
        await chrome.storage.local.get(
            "lyricsWindowSize"
        );

    // 沒有之前的設定
    if (
        !result.lyricsWindowSize
    ) {

        console.log(
            "📐 沒有之前的歌詞視窗大小"
        );


        return null;
    }


    console.log(
        "📐 找到之前的歌詞視窗大小：",
        result.lyricsWindowSize
    );

    return result.lyricsWindowSize;
}

// ========================================
// 取得已設定的歌詞資料夾
// ========================================
async function getLyricsFolder() {

    const db =
        await openDatabase();


    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                STORE_NAME,
                "readonly"
            );


        const store =
            transaction.objectStore(
                STORE_NAME
            );


        const request =
            store.get(
                "lyricsFolder"
            );


        request.onsuccess = () => {

            resolve(
                request.result
            );
        };


        request.onerror = () => {

            reject(
                request.error
            );
        };
    });
}

// ========================================
// 整理歌曲名稱
// ========================================
function normalizeFileName(name) {

    return name

        // 轉成小寫
        .toLowerCase()

        // 移除副檔名
        .replace(/\.lrc$/i, "")

        // 移除特殊空白
        .replace(/\s+/g, " ")

        // 移除前後空白
        .trim();
}

// ========================================
// 根據歌曲名稱搜尋 LRC
// ========================================
async function searchLyricsFile(
    songTitle
) {

    // 取得歌詞資料夾
    const folderHandle =
        await getLyricsFolder();


    // 沒有資料夾
    if (!folderHandle) {

        console.log(
            "❌ 尚未設定歌詞資料夾"
        );

        return null;
    }


    // ====================================
    // 確認權限
    // ====================================

    const permission =
        await folderHandle.queryPermission({
            mode: "read"
        });


    if (permission !== "granted") {

        console.log(
            "❌ 沒有歌詞資料夾權限"
        );

        return null;
    }


    // ====================================
    // 整理歌曲名稱
    // ====================================

    const normalizedTitle =
        normalizeFileName(
            songTitle
        );


    console.log(
        "🔍 搜尋歌詞：",
        normalizedTitle
    );


    // ====================================
    // 掃描資料夾
    // ====================================

    for await (
        const entry of
        folderHandle.values()
    ) {

        // 只處理檔案
        if (
            entry.kind !== "file"
        ) {
            continue;
        }


        // 只處理 LRC
        if (
            !entry.name
                .toLowerCase()
                .endsWith(".lrc")
        ) {
            continue;
        }


        // 整理檔名
        const normalizedFileName =
            normalizeFileName(
                entry.name
            );


        console.log(
            "🔎 比較：",
            normalizedFileName
        );


        // ==================================
        // 完全相同
        // ==================================

        if (
            normalizedFileName ===
            normalizedTitle
        ) {

            console.log(
                "🎵 找到完全相符的歌詞：",
                entry.name
            );


            const file =
                await entry.getFile();


            const text =
                await file.text();


            return {

                fileName:
                    entry.name,

                text:
                    text
            };
        }
    }


    // ====================================
    // 找不到
    // ====================================

    console.log(
        "❌ 找不到對應的 LRC"
    );


    return null;
}

// ========================================
// 找指定的 LRC 檔案
// ========================================
async function findLyricsFile(fileName) 
{
    // 取得歌詞資料夾
    const folderHandle =
        await getLyricsFolder();


    // 沒有設定資料夾
    if (!folderHandle) {

        console.log(
            "❌ 尚未設定歌詞資料夾"
        );

        return null;
    }


    // 檢查資料夾權限
    const permission =
        await folderHandle.queryPermission({
            mode: "read"
        });


    console.log(
        "📁 資料夾權限：",
        permission
    );


    // 如果沒有權限
    if (permission !== "granted") {

        console.log(
            "❌ 沒有歌詞資料夾讀取權限"
        );

        return null;
    }


    // ====================================
    // 尋找檔案
    // ====================================

    try {

        // 嘗試直接取得檔案
        const fileHandle =
            await folderHandle.getFileHandle(
                fileName
            );


        // 取得 File
        const file =
            await fileHandle.getFile();


        // 讀取文字
        const text =
            await file.text();


        console.log(
            "🎵 找到歌詞：",
            fileName
        );

        console.log("📖 歌詞內容：",text);


        return text;


    } catch (error) {

        console.log(
            "❌ 找不到歌詞：",
            fileName
        );

        return null;
    }
}

// ========================================
// LRCLIB API
// ========================================

const LRCLIB_API_URL = "https://lrclib.net/api/get";

// ========================================
// 從 LRCLIB 搜尋歌詞
// ========================================

async function searchLyricsFromLRCLIB(
    trackName,
    artistName,
    albumName = null,
    duration = null
) {
    console.log("🌐 開始搜尋 LRCLIB：");

    console.log("🎵 歌曲：", trackName);

    console.log("🎤 歌手：", artistName);

    try {
        // ====================================
        // 建立 URL
        // ====================================
        const url = new URL(LRCLIB_API_URL);

        // ====================================
        // 必填參數
        // ====================================
        url.searchParams.set("track_name", trackName);

        url.searchParams.set("artist_name", artistName);

        // ====================================
        // 專輯名稱
        // ====================================
        if (albumName) {
            url.searchParams.set("album_name", albumName);
        }

        // ====================================
        // 歌曲長度
        // ====================================
        if (duration) {
            url.searchParams.set("duration", Math.round(duration));
        }

        console.log("🌐 LRCLIB URL：", url.toString());

        // ====================================
        // 呼叫 API
        // ====================================
        const response =
            await fetch(
                url,
                {
                    headers: {"Lrclib-Client": "YTM-Lyrics/1.0"}
                }
            );

        // ====================================
        // 找不到
        // ====================================
        if (
            response.status === 404
        ) {
            console.log("❌ LRCLIB 找不到歌詞");
            return null;
        }

        // ====================================
        // API 錯誤
        // ====================================
        if (!response.ok) {
            console.error("❌ LRCLIB API 錯誤：", response.status);
            return null;
        }

        // ====================================
        // 解析 JSON
        // ====================================
        const data = await response.json();

        console.log("📦 LRCLIB 回傳資料：", data);

        // ====================================
        // 沒有同步歌詞
        // ====================================
        if (!data.syncedLyrics) {
            console.log("⚠️ LRCLIB 有歌曲，但沒有同步歌詞");
            return null;
        }

        console.log("✅ LRCLIB 找到同步歌詞");

        return {
            trackName: data.trackName,
            artistName: data.artistName,
            albumName: data.albumName,
            duration: data.duration,
            syncedLyrics: data.syncedLyrics
        };
    } catch (error) {
        console.error("❌ LRCLIB 搜尋失敗：", error);
        return null;
    }
}

// ========================================
// 解析 LRC 歌詞
// ========================================

function parseLRCLyrics(
    lrcText
) {
    console.log("📝 開始解析 LRC 歌詞");

    // ====================================
    // 確認資料
    // ====================================
    if (!lrcText) {
        console.log("❌ 沒有 LRC 歌詞內容");
        return [];
    }

    // ====================================
    // 分割每一行
    // ====================================
    const lines = lrcText.split(/\r?\n/);

    const lyrics = [];


    // ====================================
    // LRC 格式
    //
    // [00:12.34]歌詞
    // ====================================
    const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/;

    // ====================================
    // 一行一行解析
    // ====================================
    for (const line of lines) {
        const match = line.match(timeRegex);

        // 找不到時間
        if (!match) {
            continue;
        }

        // ====================================
        // 分鐘
        // ====================================
        const minutes = parseInt(match[1], 10);

        // ====================================
        // 秒
        // ====================================
        const seconds = parseFloat(match[2]);

        // ====================================
        // 總秒數
        // ====================================
        const time = minutes * 60 + seconds;

        // ====================================
        // 取得歌詞文字
        // ====================================
        const text =
            line.replace(timeRegex, "").trim();

        // 空歌詞跳過
        if (!text) {
            continue;
        }

        // ====================================
        // 加入歌詞
        // ====================================
        lyrics.push({
            time: time,
            text: text
        });
    }

    // ====================================
    // 按照時間排序
    // ====================================
    lyrics.sort(
        (a, b) =>
            a.time - b.time
    );

    console.log(
        "✅ LRC 解析完成，共",
        lyrics.length,
        "句"
    );

    return lyrics;
}

// ========================================
// 儲存並更新目前歌詞
// ========================================

async function updateSavedLyrics(lyrics) {
    // ====================================
    // 確認歌詞格式
    // ====================================
    if (!Array.isArray(lyrics)) {

        console.error(
            "❌ updateSavedLyrics 收到的 lyrics 不是陣列"
        );

        return false;
    }

    // ====================================
    // 儲存完整歌詞
    // ====================================

    savedLyrics = lyrics;

    console.log(
        "💾 歌詞已儲存到 Background，共",
        savedLyrics.length,
        "句"
    );

    // ====================================
    // 通知歌詞視窗
    // ====================================
    const success =
        await sendMessageToLyricsWindow({

        type:
            "lyricsUpdated",

        lyrics:
            savedLyrics

    });
    console.log("📤 lyricsUpdated 傳送結果：", success);

    return success;
}

// ========================================
// 接收其他程式的訊息
// ========================================
chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        console.log("📨 Background 收到訊息：",message);

        // ========================================
        // 開啟歌詞視窗
        // ========================================
        if (message.type === "openLyricsWindow") {
            (async () =>{
                console.log(
                    "🪟 收到開啟歌詞視窗要求"
                );
                // ====================================
                // 已經有歌詞視窗
                // ====================================
                if (
                    lyricsWindowId !== null
                ) {
                    try {
                        const existingWindow = await chrome.windows.get(lyricsWindowId);

                        console.log("♻️ 已存在歌詞視窗，沿用 ID：", lyricsWindowId);

                        // 確保視窗沒有被最小化
                        if (existingWindow.state === "minimized") {
                            await chrome.windows.update(lyricsWindowId, {state: "normal"});
                        }
                        return;
                    } catch (error) {

                        console.log("⚠️ 原歌詞視窗已不存在，準備重新建立");

                        // 清除失效 ID
                        lyricsWindowId = null;
                    }
                }
                // ====================================
                // 讀取上次位置與大小
                // ====================================
                try {
                    const [position, size] = await Promise.all([
                        loadLyricsWindowPosition(),
                        loadLyricsWindowSize()]);

                    console.log("📍 上次位置：", position);
                    console.log("📐 上次大小：", size);

                    // ====================================
                    // 建立預設視窗設定
                    // ====================================
                    const windowOptions = {
                        url:
                            chrome.runtime.getURL("lyrics.html"),
                        type:
                            "popup",
                        width:
                            500,
                        height:
                            700
                    };

                    // ====================================
                    // 套用上次位置
                    // ====================================
                    if (position) {
                        console.log("📍 套用上次位置");

                        windowOptions.left = position.left;
                        windowOptions.top = position.top;
                    }

                    // ====================================
                    // 套用上次大小
                    // ====================================
                    if (size) {
                        console.log("📐 套用上次大小");

                        windowOptions.width = size.width;
                        windowOptions.height = size.height;
                    }

                    // ====================================
                    // 建立歌詞視窗
                    // ====================================
                    const newWindow = await chrome.windows.create(windowOptions);

                    // ====================================
                    // 記住歌詞視窗 ID
                    // ====================================
                    lyricsWindowId = newWindow.id;

                    console.log("🆕 歌詞視窗已建立，ID：", lyricsWindowId);

                    console.log(
                        "📍 目前位置：",
                        newWindow.left,
                        newWindow.top
                    );


                    console.log(
                        "📐 目前大小：",
                        newWindow.width,
                        newWindow.height
                    );
                } catch (error) {
                    console.error(
                        "❌ 建立歌詞視窗失敗：",
                        error
                    );
                }
            })();
            return;
        }

        // ========================================
        // 移動歌詞視窗
        // ========================================
        if (message.type === "moveLyricsWindow"){
            console.log(
                "🪟 收到視窗移動：",
                message.deltaX,
                message.deltaY
            );

            // ====================================
            // 確認歌詞視窗 ID
            // ====================================
            console.log("🪟 目前歌詞視窗 ID：", lyricsWindowId);

            // 如果沒有視窗 ID
            if (lyricsWindowId === null) {
                console.error("❌ lyricsWindowId 是 null");
                return;
            }

            // ====================================
            // 取得目前視窗
            // ====================================
            chrome.windows.get(lyricsWindowId)
            .then((window) => {
                console.log("🪟 目前視窗位置：",
                    window.left,
                    window.top);

                // ====================================
                // 計算新位置
                // ====================================
                const newLeft = window.left + message.deltaX;
                const newTop = window.top + message.deltaY;

                console.log("🪟 新位置：", newLeft, newTop);

                // ====================================
                // 移動視窗
                // ====================================

                return chrome.windows.update(
                    lyricsWindowId,
                    {
                        left: newLeft,
                        top: newTop
                    }
                ).then(() => {
                    console.log("✅ 歌詞視窗移動成功");
                })
            })
            .catch((error) => {

                console.error(
                    "❌ 移動歌詞視窗失敗：",
                    error
                );

            });


            return;
        }

        // ========================================
        // 收到完整歌詞
        // ========================================
        if (message.type === "updateLyrics") {

            console.log(
                "📝 Background 收到完整歌詞，共",
                message.lyrics?.length,
                "句"
            );
            (async () => {
                try {
                    const success =
                        await updateSavedLyrics(
                            message.lyrics
                        );

                    console.log(
                        "🎵 Background 歌詞更新完成：",
                        success
                    );
                } catch (error) {
                    console.error(
                        "❌ Background 更新歌詞失敗：",
                        error
                    );
                }
            })();
            return;
        }

        // ========================================
        // 收到目前播放歌詞
        // ========================================
        if (message.type === "updateCurrentLyric"){
            console.log(
                "🎵 Background 收到目前歌詞：",
                message.lyric
            );


            // 記住目前播放的歌詞
            savedCurrentLyric =
                message.lyric;


            console.log(
                "💾 目前歌詞已儲存：",
                savedCurrentLyric.text
            );

            // ====================================
            // 通知歌詞視窗
            // ====================================

            sendMessageToLyricsWindow({
                type:
                    "currentLyricUpdated",

                lyric:
                    savedCurrentLyric

            });

            return;
        }

        // ========================================
        // 換歌時清除上一首的歌詞
        // ========================================
        if (message.type === "songChanged") {
            console.log("🔄 偵測到換歌，清除上一首目前歌詞");

            // ====================================
            // 清除上一首完整歌詞
            // ====================================
            savedLyrics = [];

            // ====================================
            // 清除上一首目前歌詞
            // ====================================
            savedCurrentLyric = null;
        
            console.log("🧹 Background 已清除上一首歌詞");

            // ====================================
            // 通知歌詞視窗清空畫面
            // ====================================

            sendMessageToLyricsWindow({
                type:
                    "lyricsUpdated",
                lyrics:
                    []
            });

            return;
        }

        // ========================================
        // 歌詞顯示設定變更
        // ========================================
        if (message.type === "lyricDisplaySettingChanged"){
            console.log("🎨 收到歌詞顯示設定變更：", message.setting, message.value);

            chrome.runtime.sendMessage({
                type:"lyricDisplaySettingChanged",
                setting:message.setting,
                value:message.value});

            return;
        }

        // ========================================
        // 歌詞視窗要求目前資料
        // ========================================
        if (message.type === "requestLyrics") {
            console.log("📨 歌詞視窗要求目前資料");

            console.log(
                "📦 回傳歌詞：",
                savedLyrics.length,
                "句"
            );
            
            console.log(
                "🎯 回傳目前歌詞：",
                savedCurrentLyric
            );

            sendResponse({
                lyrics:
                    savedLyrics,
                currentLyric:
                    savedCurrentLyric
            });


            return true;
        }

        // ==================================
        // 搜尋歌詞
        //
        // ① 先搜尋本地 LRC
        // ② 找不到時自動搜尋 LRCLIB
        // ==================================
        if (message.type === "searchLyrics") {
            (async () => {
                try {
                    // ====================================
                    // ① 先搜尋本機 LRC
                    // ====================================
                    const localResult =
                        await searchLyricsFile(
                            message.songTitle
                        );

                    if (localResult) {

                        console.log(
                            "💾 使用本機 LRC：",
                            localResult.fileName
                        );

                        sendResponse({
                            success: true,
                            source: "local",
                            fileName: localResult.fileName,
                            text: localResult.text
                        });

                        return;
                    }

                    // ====================================
                    // ② 本機找不到 → 搜尋 LRCLIB
                    // ====================================

                    console.log(
                        "🌐 本機沒有找到 LRC，改搜尋 LRCLIB"
                    );

                    const lrclibResult =
                        await searchLyricsFromLRCLIB(
                            message.songTitle,
                            message.artistName,
                            message.albumName,
                            message.duration
                        );

                    // ====================================
                    // ③ LRCLIB 也找不到
                    // ====================================

                    if (!lrclibResult) {

                        console.log(
                            "❌ 本機 LRC 與 LRCLIB 都找不到同步歌詞"
                        );

                        sendResponse({
                            success: false,
                            source: null,
                            fileName: null,
                            text: null
                        });

                        return;
                    }

                    // ====================================
                    // ④ 找到 LRCLIB 同步歌詞
                    // ====================================

                    console.log(
                        "✅ LRCLIB 找到同步歌詞"
                    );
                    
                    console.log(
                        "📤 準備 sendResponse 給 content.js"
                    );

                    console.log(
                        "📊 LRCLIB 歌詞長度：",
                        lrclibResult.syncedLyrics?.length
                    );

                    try {

                        sendResponse({

                            success: true,

                            source: "lrclib",

                            fileName: null,

                            text: lrclibResult.syncedLyrics

                        });

                        console.log(
                            "✅ sendResponse 已執行"
                        );

                    } catch (error) {

                        console.error(
                            "❌ sendResponse 發生錯誤：",
                            error
                        );
                    }

                } catch (error) {

                    console.error(
                        "❌ 搜尋歌詞失敗：",
                        error
                    );

                    sendResponse({
                        success: false,
                        source: null,
                        fileName: null,
                        text: null
                    });
                }

            })();

            return true;
        }

        // ==================================
        // 測試尋找 LRC
        // ==================================
        if (message.type === "findLyrics") {
            findLyricsFile(
                message.fileName
            )
            .then((text) => {

                sendResponse({

                    success:
                        text !== null,

                    text:
                        text

                });

            })
            .catch((error) => {

                console.error(
                    "❌ 讀取歌詞失敗：",
                    error
                );


                sendResponse({

                    success:
                        false,

                    text:
                        null

                });
            });

            // 非同步回應一定要 return true
            return true;
        }


        // ==================================
        // 測試 LRCLIB 同步歌詞解析
        // ==================================
        if (message.type === "testLRCLIBLyrics") {

            searchLyricsFromLRCLIB(
                message.trackName,
                message.artistName,
                message.albumName,
                message.duration
            )
            .then((result) => {

                if (!result) {

                    sendResponse({
                        success: false,
                        lyrics: []
                    });

                    return;
                }

                const lyrics =
                    parseLRCLyrics(
                        result.syncedLyrics
                    );

                console.log(
                    "📦 解析後歌詞：",
                    lyrics
                );

                updateSavedLyrics(
                    lyrics
                );

                sendResponse({
                    success: true,
                    lyrics: lyrics
                });

            })
            .catch((error) => {

                console.error(
                    "❌ LRCLIB 歌詞解析測試失敗：",
                    error
                );

                sendResponse({
                    success: false,
                    lyrics: []
                });

            });

            return true;
        }

    }
);

// ========================================
// 偵測歌詞視窗大小改變
// ========================================
chrome.windows.onBoundsChanged.addListener(
    (window) => {

        // 不是歌詞視窗
        if (window.id !== lyricsWindowId) {
            return;
        }

        console.log(
            "📐 歌詞視窗大小/位置改變：",
            "left =",
            window.left,
            "top =",
            window.top,
            "width =",
            window.width,
            "height =",
            window.height
        );

        // ====================================
        // 儲存視窗大小
        // ====================================
        saveLyricsWindowSize(
            window.width,
            window.height
        );

        saveLyricsWindowPosition(
            window.left,
            window.top
        );

    }
);

// ========================================
// 偵測歌詞視窗被關閉
// ========================================
chrome.windows.onRemoved.addListener(
    (windowId) => {
        // 不是目前歌詞視窗
        if (
            windowId !==
            lyricsWindowId
        ) {
            return;
        }

        console.log(
            "🗑️ 歌詞視窗已關閉：",
            windowId
        );


        // 清除歌詞視窗 ID
        lyricsWindowId =
            null;


        console.log(
            "🧹 lyricsWindowId 已清除"
        );

    }
);

console.log("🚀 YTM Lyrics Background 啟動！");