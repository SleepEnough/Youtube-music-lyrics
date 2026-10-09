// ========================================
// YTM Lyrics - Background
// ========================================

// ========================================
// 載入歌手別名資料庫
// ========================================
importScripts(
    "artist-aliases.js",
    "track-aliases.js"
);

// 目前完整歌詞
let savedLyrics = [];

// 目前播放的歌詞
let savedCurrentLyric = null;

// ========================================
// 記錄目前提供歌詞的 YouTube Music 分頁
// ========================================
// lyrics.html 是獨立視窗，
// 它本身不是 YouTube Music 分頁。
//
// 因此當使用者在 lyrics.html 選擇
// LRCLIB 候選歌詞時，Background 必須知道
// 要把切換要求送回哪一個 YTM 分頁。
// ========================================
let lastYtmTabId = null;

// ========================================
// 記錄目前歌詞搜尋的 Load ID
// ========================================
// 避免舊歌曲的候選切換要求
// 被送到目前歌曲。
// ========================================
let lastLyricLoadId = null;

// ========================================
// 目前歌曲的 LRCLIB 候選歌詞
// ========================================
//
// Background 會暫存這些資料，
// 讓 lyrics.html 開啟或重新載入時，
// 仍然可以取得目前歌曲的候選。
// ========================================
let savedLyricCandidates = [];
let savedSelectedLyricCandidate = null;

// ========================================
// 歌詞視窗 ID
// ========================================
let lyricsWindowId = null;

// ========================================
// 是否正在建立歌詞視窗
// 防止多次 openLyricsWindow 同時建立視窗
// ========================================
let lyricsWindowCreating = false;

// ========================================
// 儲存 Background 重要狀態
// ========================================
async function saveRuntimeState() {

    try {

        await chrome.storage.local.set({

            lyricsWindowId:
                lyricsWindowId,

            lastYtmTabId:
                lastYtmTabId,

            lastLyricLoadId:
                lastLyricLoadId

        });

        console.log(
            "💾 Background 狀態已儲存：",
            {
                lyricsWindowId,
                lastYtmTabId,
                lastLyricLoadId
            }
        );

    } catch (error) {

        console.error(
            "❌ 儲存 Background 狀態失敗：",
            error
        );
    }
}

// ========================================
// 讀取 Background 重要狀態
// ========================================
async function loadRuntimeState() {

    try {

        const result =
            await chrome.storage.local.get([
                "lyricsWindowId",
                "lastYtmTabId",
                "lastLyricLoadId"
            ]);

        // ====================================
        // 還原歌詞視窗 ID
        // ====================================
        if (
            Number.isInteger(
                result.lyricsWindowId
            )
        ) {

            lyricsWindowId =
                result.lyricsWindowId;
        }

        // ====================================
        // 還原 YTM Tab ID
        // ====================================
        if (
            Number.isInteger(
                result.lastYtmTabId
            )
        ) {

            lastYtmTabId =
                result.lastYtmTabId;
        }

        // ====================================
        // 還原 Load ID
        // ====================================
        if (
            result.lastLyricLoadId !==
            undefined
        ) {

            lastLyricLoadId =
                result.lastLyricLoadId;
        }

        console.log(
            "♻️ Background 狀態已還原：",
            {
                lyricsWindowId,
                lastYtmTabId,
                lastLyricLoadId
            }
        );

    } catch (error) {

        console.error(
            "❌ 讀取 Background 狀態失敗：",
            error
        );
    }
}

// ========================================
// 工具列按鈕：開啟 / 叫回歌詞視窗
// ========================================
async function openOrFocusLyricsWindow() {

    console.log("🖱️ 點擊 YTM Lyrics 工具列按鈕");

    // ====================================
    // 防止同時建立多個歌詞視窗
    // ====================================
    if (lyricsWindowCreating) {

        console.log(
            "⏳ 歌詞視窗正在建立中，忽略這次要求"
        );

        return;
    }

    // ====================================
    // ① 已經有記錄的歌詞視窗
    // ====================================
    if (lyricsWindowId !== null) {

        try {

            const existingWindow =
                await chrome.windows.get(
                    lyricsWindowId
                );

            console.log(
                "♻️ 找到目前歌詞視窗：",
                lyricsWindowId
            );

            // ==================================
            // 如果最小化，先還原
            // ==================================
            if (
                existingWindow.state ===
                "minimized"
            ) {

                await chrome.windows.update(
                    lyricsWindowId,
                    {
                        state: "normal"
                    }
                );
            }

            // ==================================
            // 把歌詞視窗帶到最前面
            // ==================================
            await chrome.windows.update(
                lyricsWindowId,
                {
                    focused: true
                }
            );

            console.log(
                "🎯 已將歌詞視窗帶到前景"
            );

            return;

        } catch (error) {

            console.log(
                "⚠️ 原歌詞視窗已不存在，清除舊 ID"
            );

            lyricsWindowId = null;
        }
    }

    // ====================================
    // ② lyricsWindowId 不存在
    // 嘗試尋找實際存在的 lyrics.html
    // ====================================
    const existingWindow =
        await findExistingLyricsWindow();

    if (existingWindow) {

        console.log(
            "♻️ 找到既有歌詞視窗：",
            lyricsWindowId
        );

        // ==================================
        // 如果最小化，先還原
        // ==================================
        if (
            existingWindow.state ===
            "minimized"
        ) {

            await chrome.windows.update(
                lyricsWindowId,
                {
                    state: "normal"
                }
            );
        }

        // ==================================
        // 帶到前景
        // ==================================
        await chrome.windows.update(
            lyricsWindowId,
            {
                focused: true
            }
        );

        console.log(
            "🎯 已將既有歌詞視窗帶到前景"
        );

        return;
    }

    // ====================================
    // ③ 確定沒有歌詞視窗
    // 建立新的
    // ====================================
    lyricsWindowCreating = true;

    try {

        // ==================================
        // 讀取上次位置與大小
        // ==================================
        const [position, size] =
            await Promise.all([
                loadLyricsWindowPosition(),
                loadLyricsWindowSize()
            ]);

        console.log(
            "📍 上次位置：",
            position
        );

        console.log(
            "📐 上次大小：",
            size
        );

        // ==================================
        // 建立視窗設定
        // ==================================
        const windowOptions = {

            url:
                chrome.runtime.getURL(
                    "lyrics.html"
                ),

            type:
                "popup",

            width:
                500,

            height:
                700
        };

        // ==================================
        // 套用上次位置
        // ==================================
        if (position) {

            windowOptions.left =
                position.left;

            windowOptions.top =
                position.top;
        }

        // ==================================
        // 套用上次大小
        // ==================================
        if (size) {

            windowOptions.width =
                size.width;

            windowOptions.height =
                size.height;
        }

        // ==================================
        // 建立歌詞視窗
        // ==================================
        const newWindow =
            await chrome.windows.create(
                windowOptions
            );

        // ==================================
        // 記住視窗 ID
        // ==================================
        lyricsWindowId =
            newWindow.id;

        console.log(
            "🆕 歌詞視窗已建立，ID：",
            lyricsWindowId
        );

        await saveRuntimeState();

    } catch (error) {

        console.error(
            "❌ 建立歌詞視窗失敗：",
            error
        );

    } finally {

        lyricsWindowCreating = false;
    }
}

// ========================================
// 點擊瀏覽器工具列的 YTM Lyrics 圖示
// ========================================
chrome.action.onClicked.addListener(
    () => {
        openOrFocusLyricsWindow();
    }
);

function detectLyricType(lrcText) {
    const lines =
        lrcText.split(/\r?\n/);

    const hasTimestamp =
        lines.some(line =>
            /\[(\d+):(\d+(?:\.\d+)?)\]/.test(line)
        );

    return hasTimestamp
        ? "synced"
        : "plain";
}

// ========================================
// 取得歌曲搜尋名稱
// ========================================
// track-aliases.js 新格式：
//
// const trackAliases = [
//     {
//         match: [
//             "歌曲名稱 A",
//             "歌曲名稱 A - Remastered",
//             "歌曲名稱 A (2025)"
//         ],
//
//         search: [
//             "歌曲名稱 A",
//             "歌曲名稱 A - Remastered",
//             "歌曲名稱 A (Original)"
//         ]
//     }
//
// ];
//
// match：
// 用來判斷 YouTube Music 抓到的歌曲
// 是否屬於這一組歌曲。
//
// search：
// 找到這一組歌曲後，實際拿來搜尋
// 本機 LRC / LRCLIB 的歌曲名稱。
// ========================================
function getTrackSearchNames(trackName) {

    const names = [];

    // ========================================
    // ① 沒有歌曲名稱
    // ========================================
    if (!trackName) {
        return names;
    }

    // ========================================
    // ② 原始歌曲名稱永遠保留
    // ========================================
    names.push(trackName);

    // ========================================
    // ③ 標準化文字
    // ========================================
    //
    // 目前主要處理：
    // - 大小寫
    // - 前後空白
    // - 連續空白
    //
    // 例如：
    //
    // " GREATEST  -  Remastered "
    //
    // → "greatest - remastered"
    // ========================================
    const normalizeTrackName = (text) => {

        return String(text || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    };

    const normalizedTrackName =
        normalizeTrackName(trackName);


    // ========================================
    // ④ 尋找最符合的 alias 群組
    // ========================================
    let bestMatchGroup = null;

    let bestMatchText = null;

    let bestMatchLength = 0;

    let bestMatchType = null;


    // ========================================
    // 逐一檢查 trackAliases
    // ========================================
    for (
        const group of trackAliases
    ) {

        // ====================================
        // 確認格式正確
        // ====================================
        if (!group) {
            continue;
        }

        if (
            !Array.isArray(group.match)
        ) {
            continue;
        }

        if (
            !Array.isArray(group.search)
        ) {
            continue;
        }


        // ====================================
        // 檢查這一組的所有 match
        // ====================================
        for (
            const matchName of
            group.match
        ) {

            if (!matchName) {
                continue;
            }

            const normalizedMatch =
                normalizeTrackName(
                    matchName
                );

            if (!normalizedMatch) {
                continue;
            }


            // ==================================
            // ① 完全符合
            // ==================================
            if (
                normalizedTrackName ===
                normalizedMatch
            ) {

                // 完全符合優先
                //
                // 如果已經找到更長的完全符合，
                // 就保留更長的。
                if (
                    bestMatchType !==
                        "exact" ||
                    normalizedMatch.length >
                        bestMatchLength
                ) {

                    bestMatchGroup =
                        group;

                    bestMatchText =
                        matchName;

                    bestMatchLength =
                        normalizedMatch.length;

                    bestMatchType =
                        "exact";
                }

                continue;
            }


            // ==================================
            // ② 歌曲名稱包含 match
            // ==================================
            if (
                normalizedTrackName.includes(
                    normalizedMatch
                )
            ) {

                // 如果目前已經有完全符合，
                // 模糊符合不能取代它。
                if (
                    bestMatchType ===
                    "exact"
                ) {
                    continue;
                }

                // ==================================
                // 選擇較長的 match
                //
                // 例如：
                //
                // GREATEST
                //
                // GREATEST - Remastered
                //
                // 如果兩個都符合，
                // 優先較長的那一個。
                // ==================================
                if (
                    normalizedMatch.length >
                    bestMatchLength
                ) {

                    bestMatchGroup =
                        group;

                    bestMatchText =
                        matchName;

                    bestMatchLength =
                        normalizedMatch.length;

                    bestMatchType =
                        "fuzzy";
                }

                continue;
            }


            // ==================================
            // ③ match 包含歌曲名稱
            // ==================================
            if (
                normalizedMatch.includes(
                    normalizedTrackName
                )
            ) {

                // 如果目前已經有完全符合，
                // 模糊符合不能取代它。
                if (
                    bestMatchType ===
                    "exact"
                ) {
                    continue;
                }

                if (
                    normalizedMatch.length >
                    bestMatchLength
                ) {

                    bestMatchGroup =
                        group;

                    bestMatchText =
                        matchName;

                    bestMatchLength =
                        normalizedMatch.length;

                    bestMatchType =
                        "fuzzy";
                }
            }
        }
    }


    // ========================================
    // ⑤ 找到 alias 群組
    // ========================================
    if (bestMatchGroup) {

        console.log(
            "🔍 Track Alias 匹配：",
            {
                trackName:
                    trackName,

                matched:
                    bestMatchText,

                type:
                    bestMatchType,

                search:
                    bestMatchGroup.search
            }
        );


        // ====================================
        // 將 search 中的名稱加入搜尋清單
        // ====================================
        for (
            const searchName of
            bestMatchGroup.search
        ) {

            if (
                searchName &&
                !names.includes(
                    searchName
                )
            ) {

                names.push(
                    searchName
                );
            }
        }
    }


    // ========================================
    // ⑥ 回傳搜尋名稱
    // ========================================
    return names;
}

// ========================================
// 取得歌手搜尋名稱
// ========================================
//
// 第一個名稱永遠是 YouTube Music
// 目前提供的歌手名稱。
// 如果 artist-aliases.js 有設定別名，
// 再依序加入替代名稱。
// ========================================
function getArtistSearchNames(
    artistName
) {

    const names = [];

    // ====================================
    // ① 先使用 YouTube Music 原始名稱
    // ====================================
    if (artistName) {

        names.push(
            artistName
        );
    }

    // ====================================
    // ② 查詢歌手別名
    // ====================================
    const aliases =
        artistAliases[artistName];

    // ====================================
    // ③ 加入別名
    // ====================================
    if (Array.isArray(aliases)) {

        for (const alias of aliases) {

            // 避免加入空字串
            // 或與原名稱完全相同的名稱
            if (
                alias &&
                !names.includes(alias)
            ) {

                names.push(alias);
            }
        }
    }

    return names;
}

// ========================================
// LRCLIB 多候選搜尋
// ========================================
// 功能：
// 使用 LRCLIB /api/search 搜尋歌曲的多筆候選結果。
// 與 /api/get 不同，/api/search 可以取得多筆
// 可能符合歌曲名稱與歌手的歌詞。
// ========================================
async function searchLRCLIBCandidates(
    trackName,
    artistName,
    albumName = null,
    duration = null
) {
    // ====================================
    // 建立 LRCLIB Search API URL
    // ====================================
    const params = new URLSearchParams();

    params.set(
        "track_name",
        trackName
    );

    params.set(
        "artist_name",
        artistName
    );

    // 如果有專輯名稱，也一起提供
    if (albumName) {
        params.set(
            "album_name",
            albumName
        );
    }

    // ====================================
    // 建立完整 URL
    // ====================================
    const url =
        `https://lrclib.net/api/search?${params.toString()}`;

    console.log(
        "🔎 LRCLIB 多候選搜尋 URL：",
        url
    );

    try {
        // ====================================
        // 呼叫 LRCLIB
        //
        // 使用共用重試機制。
        // 遇到 429 / 500 / 502 / 503 / 504
        // 時會自動重新搜尋。
        // ====================================
        const response = await searchLRCLIBWithRetry(
            url,
            {
                headers: {
                    "Lrclib-Client":
                        "YTM-Lyrics/1.0"
                }
            }
        );

        // ====================================
        // API 錯誤
        // ====================================
        if (!response || !response.ok) {
            console.error(
                "❌ LRCLIB Search API 錯誤：",
                response
                    ? response.status
                    : "無回應"
            );

            return [];
        }

        // ====================================
        // 取得 JSON
        // ====================================
        const results =
            await response.json();

        // ====================================
        // 確認結果格式
        // ====================================
        if (!Array.isArray(results)) {
            console.error(
                "❌ LRCLIB Search 回傳格式不是陣列：",
                results
            );

            return [];
        }

        console.log(
            "📚 LRCLIB 找到候選：",
            results.length,
            "筆"
        );

        // ====================================
        // 將候選資料整理成我們自己的格式
        // ====================================
        const candidates =
            results.map((item) => ({
                id: item.id,
                trackName:
                    item.trackName || "",
                artistName:
                    item.artistName || "",
                albumName:
                    item.albumName || "",
                duration:
                    Number.isFinite(
                        Number(item.duration)
                    )
                        ? Number(item.duration)
                        : null,

                // 是否有同步歌詞
                hasSyncedLyrics:
                    Boolean(
                        item.syncedLyrics
                    ),

                // 是否有一般歌詞
                hasPlainLyrics:
                    Boolean(
                        item.plainLyrics
                    ),

                // 保存歌詞內容
                syncedLyrics:
                    item.syncedLyrics || null,

                plainLyrics:
                    item.plainLyrics || null
            }));

        // ====================================
        // 顯示候選資料
        // ====================================
        candidates.forEach(
            (candidate, index) => {
                console.log(
                    `🎵 候選 ${index + 1}：`,
                    {
                        id:
                            candidate.id,
                        trackName:
                            candidate.trackName,
                        artistName:
                            candidate.artistName,
                        albumName:
                            candidate.albumName,
                        duration:
                            candidate.duration,
                        hasSyncedLyrics:
                            candidate.hasSyncedLyrics,
                        hasPlainLyrics:
                            candidate.hasPlainLyrics
                    }
                );
            }
        );

        return candidates;

    } catch (error) {
        console.error(
            "❌ LRCLIB Search 失敗：",
            error
        );

        return [];
    }
}

// ========================================
// LRCLIB 候選歌詞評分
// ========================================
// 功能：
// 根據歌曲名稱、歌手、專輯、duration
// 判斷哪一筆候選最符合目前歌曲。
// ========================================
function scoreLRCLIBCandidate(
    candidate,
    trackName,
    artistName,
    albumName = null,
    duration = null
) {
    // ====================================
    // 將文字標準化
    // ====================================
    const normalizeText = (text) => {
        return String(text || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ");
    };

    const targetTrack =
        normalizeText(trackName);

    const targetArtist =
        normalizeText(artistName);

    const targetAlbum =
        normalizeText(albumName);

    const candidateTrack =
        normalizeText(
            candidate.trackName
        );

    const candidateArtist =
        normalizeText(
            candidate.artistName
        );

    const candidateAlbum =
        normalizeText(
            candidate.albumName
        );

    // ====================================
    // 初始分數
    // ====================================
    let score = 0;

    // ====================================
    // 歌曲名稱
    // ====================================
    if (
        candidateTrack === targetTrack
    ) {
        score += 50;
    } else if (
        candidateTrack.includes(
            targetTrack
        ) ||
        targetTrack.includes(
            candidateTrack
        )
    ) {
        score += 25;
    }

    // ====================================
    // 歌手
    // ====================================
    if (
        candidateArtist === targetArtist
    ) {
        score += 40;
    } else if (
        candidateArtist.includes(
            targetArtist
        ) ||
        targetArtist.includes(
            candidateArtist
        )
    ) {
        score += 20;
    }

    // ====================================
    // 專輯
    // ====================================
    if (
        targetAlbum &&
        candidateAlbum
    ) {
        if (
            candidateAlbum ===
            targetAlbum
        ) {
            score += 20;
        } else if (
            candidateAlbum.includes(
                targetAlbum
            ) ||
            targetAlbum.includes(
                candidateAlbum
            )
        ) {
            score += 10;
        }
    }

    // ====================================
    // duration
    // ====================================
    if (
        Number.isFinite(duration) &&
        Number.isFinite(
            candidate.duration
        )
    ) {
        const difference =
            Math.abs(
                duration -
                candidate.duration
            );

        // 完全相同
        if (difference < 1) {
            score += 30;
        }

        // 差距小於 3 秒
        else if (difference < 3) {
            score += 20;
        }

        // 差距小於 10 秒
        else if (difference < 10) {
            score += 10;
        }
    }

    // ====================================
    // 優先同步歌詞
    // ====================================
    if (
        candidate.hasSyncedLyrics
    ) {
        score += 100;
    } else if (
        candidate.hasPlainLyrics
    ) {
        score += 5;
    }

    return score;
}

// ========================================
// 從 LRCLIB 候選中選出最佳結果
// ========================================
function selectBestLRCLIBCandidate(
    candidates,
    trackName,
    artistName,
    albumName = null,
    duration = null
) {
    // 沒有候選
    if (
        !Array.isArray(candidates) ||
        candidates.length === 0
    ) {
        return null;
    }

    // ====================================
    // 計算每一筆候選的分數
    // ====================================
    const scoredCandidates =
        candidates.map(
            (candidate) => ({
                candidate,
                score:
                    scoreLRCLIBCandidate(
                        candidate,
                        trackName,
                        artistName,
                        albumName,
                        duration
                    )
            })
        );

    // ====================================
    // 分數由高到低排序
    // ====================================
    scoredCandidates.sort(
        (a, b) =>
            b.score - a.score
    );

    // ====================================
    // 顯示評分結果
    // ====================================
    console.log(
        "📊 LRCLIB 候選評分：",
        scoredCandidates.map(
            (item) => ({
                id:
                    item.candidate.id,
                trackName:
                    item.candidate.trackName,
                artistName:
                    item.candidate.artistName,
                duration:
                    item.candidate.duration,
                score:
                    item.score
            })
        )
    );

    // ====================================
    // 取得最高分候選
    // ====================================
    const best =
        scoredCandidates[0];

    console.log(
        "🏆 LRCLIB 最佳候選：",
        best.candidate,
        "分數：",
        best.score
    );

    return best.candidate;
}

// ========================================
// 尋找已經存在的歌詞視窗
// 用來處理 Service Worker 重啟後
// lyricsWindowId 遺失的情況
// ========================================
async function findExistingLyricsWindow() {

    try {

        const windows =
            await chrome.windows.getAll({
                populate: true
            });

        const lyricsUrl =
            chrome.runtime.getURL("lyrics.html");

        for (const window of windows) {

            if (!window.tabs) {
                continue;
            }

            for (const tab of window.tabs) {

                if (
                    tab.url &&
                    tab.url.startsWith(lyricsUrl)
                ) {

                    console.log(
                        "🔎 找到已存在的歌詞視窗，重新取得 ID：",
                        window.id
                    );

                    lyricsWindowId =
                        window.id;

                    await saveRuntimeState();

                    return window;
                }
            }
        }

        console.log(
            "🔎 找不到已存在的歌詞視窗"
        );

        return null;

    } catch (error) {

        console.error(
            "❌ 尋找既有歌詞視窗失敗：",
            error
        );

        return null;
    }
}

// ========================================
// 取得歌詞視窗的 Tab
// ========================================
//
// Service Worker 重新啟動後，
// lyricsWindowId 可能會變成 null。
// 因此不能只依賴記憶中的 window ID，
// 必須在找不到時重新掃描 Chrome。
// ========================================
async function getLyricsWindowTab() {

    // ====================================
    // ① 如果目前沒有歌詞視窗 ID
    // 先嘗試重新尋找實際存在的歌詞視窗
    // ====================================
    if (lyricsWindowId === null) {

        console.log(
            "🔎 lyricsWindowId 不存在，重新尋找歌詞視窗"
        );

        const existingWindow =
            await findExistingLyricsWindow();

        if (!existingWindow) {

            console.log(
                "❌ Chrome 中找不到歌詞視窗"
            );

            return null;
        }
    }

    try {

        // ====================================
        // ② 使用目前的 window ID 取得視窗
        // ====================================
        const window =
            await chrome.windows.get(
                lyricsWindowId,
                {
                    populate: true
                }
            );

        // ====================================
        // 確認有 Tab
        // ====================================
        if (
            !window.tabs ||
            window.tabs.length === 0
        ) {

            console.log(
                "⚠️ 歌詞視窗存在，但是沒有找到 Tab"
            );

            return null;
        }

        // ====================================
        // 找真正的 lyrics.html Tab
        // ====================================
        const lyricsUrl =
            chrome.runtime.getURL(
                "lyrics.html"
            );

        const lyricsTab =
            window.tabs.find(
                tab =>
                    tab.url === lyricsUrl
            );

        // ====================================
        // 找到歌詞 Tab
        // ====================================
        if (lyricsTab) {

            return lyricsTab;
        }

        console.log(
            "⚠️ 找到歌詞視窗，但其中沒有 lyrics.html Tab"
        );

        return null;

    } catch (error) {

        console.log(
            "⚠️ 目前歌詞視窗 ID 已失效，嘗試重新尋找：",
            error
        );

        // ====================================
        // ③ window ID 可能已經失效
        // 例如：
        // - Service Worker 重啟
        // - 視窗被關閉後重新建立
        // ====================================
        lyricsWindowId = null;

        const existingWindow =
            await findExistingLyricsWindow();

        if (!existingWindow) {

            console.log(
                "❌ 重新尋找後仍找不到歌詞視窗"
            );

            return null;
        }

        // ====================================
        // 重新取得 Tab
        // ====================================
        if (
            !existingWindow.tabs ||
            existingWindow.tabs.length === 0
        ) {

            return null;
        }

        const lyricsUrl =
            chrome.runtime.getURL(
                "lyrics.html"
            );

        const lyricsTab =
            existingWindow.tabs.find(
                tab =>
                    tab.url === lyricsUrl
            );

        if (!lyricsTab) {

            console.log(
                "❌ 重新找到視窗，但找不到 lyrics.html Tab"
            );

            return null;
        }

        console.log(
            "♻️ 已成功重新取得歌詞視窗 Tab：",
            lyricsTab.id
        );

        return lyricsTab;
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

            // console.log("📤 已成功傳送給歌詞視窗：", message.type);

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

async function searchLyricsFileWithAliases(
    trackName
) {

    // ====================================
    // 取得所有本機搜尋名稱
    //
    // 第一個：
    // YouTube Music 原始歌曲名稱
    //
    // 後面：
    // track-aliases.js 的歌曲別名
    // ====================================
    const trackSearchNames =
        getTrackSearchNames(
            trackName
        );

    console.log(
        "📁 本機 LRC 搜尋名稱：",
        trackSearchNames
    );

    // ====================================
    // 依序搜尋
    // ====================================
    for (
        const searchName of
        trackSearchNames
    ) {

        console.log(
            "🔍 嘗試本機 LRC：",
            searchName
        );

        const result =
            await searchLyricsFile(
                searchName
            );

        // ====================================
        // 找到
        // ====================================
        if (result) {

            console.log(
                "🎵 本機 LRC 搜尋成功：",
                searchName,
                "→",
                result.fileName
            );

            return {
                ...result,

                // 記錄實際使用的搜尋名稱
                matchedTrackName:
                    searchName
            };
        }
    }

    // ====================================
    // 全部找不到
    // ====================================
    console.log(
        "❌ 所有本機歌曲名稱都找不到 LRC：",
        trackSearchNames
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
// LRCLIB 重試等待
// ========================================
function wait(ms) {

    return new Promise(
        resolve => setTimeout(
            resolve,
            ms
        )
    );

}

// ========================================
// LRCLIB Search API 重試
// ========================================
async function searchLRCLIBWithRetry(
    url,
    options = {},
    maxRetries = 3
) {

    const retryableStatusCodes = [
        429,
        500,
        502,
        503,
        504
    ];

    for (
        let attempt = 1;
        attempt <= maxRetries;
        attempt++
    ) {

        try {

            const response =
                await fetch(
                    url,
                    options
                );

            // ====================================
            // 成功
            // ====================================
            if (response.ok) {

                return response;
            }

            // ====================================
            // 可以重試的錯誤
            // ====================================
            if (
                retryableStatusCodes.includes(
                    response.status
                )
            ) {

                console.log(
                    `⚠️ LRCLIB API 暫時錯誤：${response.status}`
                    + `（第 ${attempt}/${maxRetries} 次）`
                );

                // 還有重試機會
                if (
                    attempt < maxRetries
                ) {

                    const delay =
                        attempt * 1000;

                    console.log(
                        `⏳ ${delay}ms 後重新搜尋 LRCLIB`
                    );

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                delay
                            )
                    );

                    continue;
                }
            }

            // ====================================
            // 不需要重試
            // ====================================
            return response;

        } catch (error) {

            console.warn(
                `⚠️ LRCLIB 網路錯誤`
                + `（第 ${attempt}/${maxRetries} 次）：`,
                error
            );

            // ====================================
            // 還有重試機會
            // ====================================
            if (
                attempt < maxRetries
            ) {

                const delay =
                    attempt * 1000;

                console.log(
                    `⏳ ${delay}ms 後重新搜尋 LRCLIB`
                );

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            delay
                        )
                );

                continue;
            }

            console.error(
                "❌ LRCLIB 重試全部失敗"
            );

            throw error;
        }
    }

    return null;
}

// ========================================
// 從 LRCLIB 搜尋歌詞
// ========================================
async function searchLyricsFromLRCLIB(trackName, artistName, albumName = null, duration = null) {
    console.log("🌐 開始搜尋 LRCLIB：");
    console.log("🎵 歌曲：", trackName);
    console.log("🎤 歌手：", artistName);
    console.log("💿 專輯：", albumName);
    console.log("⏱️ 時長：", duration);

    const buildUrl = (includeDuration) => {
        const params = new URLSearchParams();

        params.set("track_name", trackName);
        params.set("artist_name", artistName);

        if (albumName) {
            params.set("album_name", albumName);
        }

        if (includeDuration && Number.isFinite(duration)) {
            params.set("duration", Math.round(duration));
        }

        return `${LRCLIB_API_URL}?${params.toString()}`;
    };

    // 第一次：如果有 duration，優先帶 duration 搜尋
    let url = buildUrl(true);

    console.log("🌐 LRCLIB URL：", url);

    try {
        let response = await searchLRCLIBWithRetry(url, {
            headers: {
                "Lrclib-Client": "YTM-Lyrics/1.0"
            }
        });

        // 帶 duration 找不到
        if (response.status === 404 && Number.isFinite(duration)) {
            console.log("⚠️ LRCLIB 帶 duration 找不到，改用不帶 duration 再搜尋");

            // 第二次：完全不帶 duration
            url = buildUrl(false);

            console.log("🌐 LRCLIB fallback URL：", url);

            response = await searchLRCLIBWithRetry(url, {
                headers: {
                    "Lrclib-Client": "YTM-Lyrics/1.0"
                }
            });
        }

        if (!response || response.status === 404) {
            console.log("❌ LRCLIB 找不到歌詞");
            return null;
        }

        if (!response.ok) {
            console.log("❌ LRCLIB API 錯誤：", response.status);
            return null;
        }

        const data = await response.json();

        console.log("📦 LRCLIB 回傳資料：", data);

        // 沒有同步歌詞，但有純文字歌詞
        if (!data.syncedLyrics) {
            if (data.plainLyrics) {
                console.log("✅ LRCLIB 找到純文字歌詞");

                return {
                    type: "plain",
                    syncedLyrics: null,
                    plainLyrics: data.plainLyrics
                };
            }

            console.log("❌ LRCLIB 沒有歌詞");
            return null;
        }

        console.log("✅ LRCLIB 找到同步歌詞");

        return {
            type: "synced",
            syncedLyrics: data.syncedLyrics,
            plainLyrics: data.plainLyrics || null
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
        // console.log("📨 Background 收到訊息：",message);

        // ========================================
        // 開啟歌詞視窗
        // ========================================
        if (message.type === "openLyricsWindow") {

            (async () => {

                console.log(
                    "收到開啟歌詞視窗要求"
                );

                // ====================================
                // 防止同時建立多個歌詞視窗
                // ====================================

                if (lyricsWindowCreating) {

                    console.log(
                        "⏳ 歌詞視窗正在建立中，忽略這次開窗要求"
                    );

                    return;
                }

                // ====================================
                // ① 目前有記錄 window ID
                // ====================================

                if (
                    lyricsWindowId !== null
                ) {

                    try {

                        const existingWindow =
                            await chrome.windows.get(
                                lyricsWindowId
                            );

                        console.log(
                            "♻️ 已存在歌詞視窗，沿用 ID：",
                            lyricsWindowId
                        );

                        // ====================================
                        // 確保視窗沒有被最小化
                        // ====================================

                        if (
                            existingWindow.state ===
                            "minimized"
                        ) {

                            await chrome.windows.update(
                                lyricsWindowId,
                                {
                                    state: "normal"
                                }
                            );
                        }

                        return;

                    } catch (error) {

                        console.log(
                            "⚠️ 原歌詞視窗已不存在，清除舊 ID"
                        );

                        lyricsWindowId = null;
                    }
                }

                // ====================================
                // ② 沒有 window ID
                //
                // 可能是：
                //
                // - Service Worker 剛重新啟動
                // - window ID 記憶遺失
                //
                // 先搜尋 Chrome 裡是否已經存在
                // lyrics.html
                // ====================================

                const existingWindow =
                    await findExistingLyricsWindow();

                if (existingWindow) {

                    console.log(
                        "♻️ 找回既有歌詞視窗，沿用 ID：",
                        lyricsWindowId
                    );

                    // ==================================
                    // 如果視窗被最小化
                    // 恢復正常
                    // ==================================

                    if (
                        existingWindow.state ===
                        "minimized"
                    ) {

                        await chrome.windows.update(
                            lyricsWindowId,
                            {
                                state: "normal"
                            }
                        );
                    }

                    return;
                }

                // ====================================
                // ③ 確定真的沒有歌詞視窗
                // 才建立新的
                // ====================================

                lyricsWindowCreating = true;

                console.log(
                    "🆕 確認沒有歌詞視窗，準備建立新視窗"
                );

                try {

                    // ====================================
                    // 讀取上次位置與大小
                    // ====================================

                    const [position, size] =
                        await Promise.all([
                            loadLyricsWindowPosition(),
                            loadLyricsWindowSize()
                        ]);

                    console.log(
                        "📍 上次位置：",
                        position
                    );

                    console.log(
                        "📐 上次大小：",
                        size
                    );

                    // ====================================
                    // 建立預設視窗設定
                    // ====================================

                    const windowOptions = {

                        url:
                            chrome.runtime.getURL(
                                "lyrics.html"
                            ),

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

                        console.log(
                            "📍 套用上次位置"
                        );

                        windowOptions.left =
                            position.left;

                        windowOptions.top =
                            position.top;
                    }

                    // ====================================
                    // 套用上次大小
                    // ====================================

                    if (size) {

                        console.log(
                            "📐 套用上次大小"
                        );

                        windowOptions.width =
                            size.width;

                        windowOptions.height =
                            size.height;
                    }

                    // ====================================
                    // 建立歌詞視窗
                    // ====================================

                    const newWindow =
                        await chrome.windows.create(
                            windowOptions
                        );

                    // ====================================
                    // 記住歌詞視窗 ID
                    // ====================================

                    lyricsWindowId =
                        newWindow.id;

                    console.log(
                        "🆕 歌詞視窗已建立，ID：",
                        lyricsWindowId
                    );

                    await saveRuntimeState();

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

                } finally {

                    // ====================================
                    // 不管成功或失敗
                    // 都解除建立鎖
                    // ====================================

                    lyricsWindowCreating = false;

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
            // console.log("🎵 Background 收到目前歌詞：", message.lyric);

            // 記住目前播放的歌詞
            savedCurrentLyric =
                message.lyric;


            // console.log(
            //     "💾 目前歌詞已儲存：",
            //     savedCurrentLyric.text
            // );

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
        // 接收 lyrics.js 的候選歌詞切換要求
        // ========================================
        //
        // lyrics.js
        //     ↓
        // Background
        //     ↓
        // content.js
        //
        // Background 不負責實際切換歌詞，
        // 只負責把要求送回正確的 YTM 分頁。
        // ========================================
        if (message.type === "selectLyricCandidate") {

            console.log(
                "📨 Background 收到候選切換要求：",
                message
            );

            // ====================================
            // 確認目前有記錄 YTM 分頁
            // ====================================
            if (
                !Number.isInteger(
                    lastYtmTabId
                )
            ) {

                console.error(
                    "❌ 找不到目前的 YTM 分頁 ID"
                );

                return;
            }

            // ====================================
            // 確認 Load ID
            // ====================================
            //
            // 如果 message 帶有 loadId，
            // 就確認它是否仍然是目前歌曲。
            //
            // 這可以避免使用者切歌後，
            // 舊的候選切換要求誤套用到新歌曲。
            // ====================================
            if (
                message.loadId !== undefined &&
                message.loadId !== null &&
                lastLyricLoadId !== null &&
                String(message.loadId) !==
                    String(lastLyricLoadId)
            ) {

                console.warn(
                    "⚠️ 忽略舊歌曲的候選切換要求：",
                    {
                        messageLoadId:
                            message.loadId,

                        currentLoadId:
                            lastLyricLoadId
                    }
                );

                return;
            }

            console.log(
                "📤 Background → content.js",
                {
                    tabId:
                        lastYtmTabId,

                    candidateId:
                        message.candidateId,

                    loadId:
                        message.loadId
                }
            );

            // ====================================
            // 將候選切換要求送回 content.js
            // ====================================
            chrome.tabs.sendMessage(
                lastYtmTabId,
                {
                    type:
                        "selectLyricCandidate",

                    candidateId:
                        message.candidateId,

                    loadId:
                        message.loadId
                }
            ).catch(
                (error) => {

                    console.error(
                        "❌ 無法將候選切換要求送到 content.js：",
                        error
                    );
                }
            );

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

            // ========================================
            // 清除上一首歌曲的 LRCLIB 候選
            // ========================================
            savedLyricCandidates = [];

            savedSelectedLyricCandidate =
                null;

            console.log("🧹 已清除上一首歌曲的 LRCLIB 候選");

            sendMessageToLyricsWindow({

                type:
                    "lyricCandidatesUpdated",

                candidates: [],

                selectedCandidate: null
            });

            // ========================================
            // 重設歌詞同步偏移
            // ========================================
            sendMessageToLyricsWindow({
                type:
                    "setLyricTimeOffset",

                offset:
                    0
            });

            console.log("🎚️ 已通知歌詞視窗重設同步偏移：0.0 秒");

            return;
        }

        // ========================================
        // 歌詞顯示設定變更
        // ========================================
        if (message.type === "lyricDisplaySettingChanged"){
            console.log("🎨 收到歌詞顯示設定變更：", message.setting, message.value);

            sendMessageToLyricsWindow({
                type:"lyricDisplaySettingChanged",
                setting:message.setting,
                value:message.value
            });

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

            // ========================================
            // 回傳目前歌詞資料
            // ========================================
            //
            // 除了目前歌詞與目前播放句之外，
            // 一併回傳目前歌曲的 LRCLIB 候選。
            //
            // 這樣 lyrics.html 即使是在 LRCLIB
            // 搜尋完成後才開啟，也能取得候選。
            // ========================================
            sendResponse({

                lyrics:
                    savedLyrics,

                currentLyric:
                    savedCurrentLyric,

                candidates:
                    savedLyricCandidates,

                selectedCandidate:
                    savedSelectedLyricCandidate

            });


            return true;
        }

        // ========================================
        // 搜尋歌曲歌詞
        // ========================================
        // 搜尋順序：
        // ① 本機 LRC
        // ② LRCLIB 多候選搜尋
        //
        // LRCLIB 找到多筆時：
        // - 自動選出最佳候選
        // - 將所有候選一起回傳
        //
        // Load ID 會原封不動帶回 content.js，
        // 讓 content.js 確認搜尋結果是否仍屬於目前歌曲。
        // ========================================
        if (message.type === "searchLyrics") {

            console.log("📨 Background 收到 searchLyrics：", message);

            // ====================================
            // 使用 async IIFE
            //
            // 因為 onMessage listener 本身
            // 需要 return true 保留 sendResponse。
            // ====================================
            (async () => {
                try {
                    // ====================================
                    // 取得歌曲資訊
                    // ====================================
                    const songTitle =
                        message.songTitle || "";

                    const artistName =
                        message.artistName || "";

                    const albumName =
                        message.albumName || null;

                    const duration =
                        Number.isFinite(
                            Number(message.duration)
                        )
                            ? Number(message.duration)
                            : null;

                    const loadId =
                        message.loadId;

                    // ========================================
                    // 記錄這次搜尋來自哪一個 YTM 分頁
                    // ========================================
                    //
                    // sender.tab.id 就是 content.js 所在的
                    // YouTube Music 分頁 ID。
                    //
                    // 之後 lyrics.js 選擇候選歌詞時，
                    // Background 就能把要求送回這個分頁。
                    // ========================================
                    if (
                        sender &&
                        sender.tab &&
                        Number.isInteger(sender.tab.id)
                    ) {

                        lastYtmTabId =
                            sender.tab.id;

                        console.log(
                            "📌 記錄 YTM 分頁 ID：",
                            lastYtmTabId
                        );

                        await saveRuntimeState();
                    }

                    // ========================================
                    // 記錄目前歌曲的 Load ID
                    // ========================================
                    lastLyricLoadId =
                        loadId;

                    console.log(
                        "📌 記錄目前歌詞 Load ID：",
                        lastLyricLoadId
                    );

                    await saveRuntimeState();

                    console.log(
                        "🔍 開始搜尋歌詞：",
                        {
                            songTitle,
                            artistName,
                            albumName,
                            duration,
                            loadId
                        }
                    );

                    // ====================================
                    // 第一階段：
                    // 搜尋本機 LRC
                    // ====================================

                    const localResult =
                        await searchLyricsFileWithAliases(
                            songTitle
                        );

                    // ====================================
                    // 找到本機 LRC
                    // ====================================
                    if (localResult) {

                        console.log(
                            "💾 找到本機 LRC：",
                            localResult.fileName
                        );

                        // ========================================
                        // 本機 LRC 不使用 LRCLIB 候選
                        // ========================================
                        savedLyricCandidates = [];

                        savedSelectedLyricCandidate =
                            null;

                        // 通知歌詞視窗清除候選選單
                        sendMessageToLyricsWindow({

                            type:
                                "lyricCandidatesUpdated",

                            candidates: [],

                            selectedCandidate: null
                        });

                        // ====================================
                        // 本機 LRC 不需要候選選單。
                        //
                        // 因為目前本機搜尋是：
                        // 歌曲名稱 → 精確檔名
                        // ====================================
                        sendResponse({

                            success: true,

                            source: "local",

                            fileName:
                                localResult.fileName,

                            text:
                                localResult.text,

                            lyricType:
                                detectLyricType(localResult.text),

                            loadId,

                            // ==================================
                            // Local LRC 沒有 LRCLIB 候選
                            // ==================================
                            candidates: [],

                            selectedCandidate: null

                        });

                        return;
                    }

                    // ====================================
                    // 第二階段：
                    // LRCLIB 多候選搜尋
                    // ====================================
                    console.log(
                        "🌐 找不到本機 LRC，開始搜尋 LRCLIB 多候選"
                    );

                    // ====================================
                    // 取得歌手搜尋名稱
                    // ====================================
                    const artistSearchNames =
                        getArtistSearchNames(
                            artistName
                        );

                    console.log(
                        "🎤 歌手搜尋名稱：",
                        artistSearchNames
                    );

                    // ====================================
                    // 取得歌曲搜尋名稱
                    // ====================================
                    const trackSearchNames =
                        getTrackSearchNames(
                            songTitle
                        );

                    console.log(
                        "🎵 歌曲搜尋名稱：",
                        trackSearchNames
                    );

                    // ====================================
                    // 所有 LRCLIB 候選
                    // ====================================
                    //
                    // 不再只保留最後一次搜尋結果。
                    // 每一組搜尋找到的候選都會加入這裡，
                    // 最後統一進行評分。
                    // ====================================
                    let candidates = [];

                    // ====================================
                    // 暫存「只有一般歌詞」的候選
                    //
                    // 如果最後完全找不到同步歌詞，
                    // 就從這裡選出一般歌詞候選。
                    // ====================================
                    let fallbackCandidates = [];

                    // ====================================
                    // 記錄第一批一般歌詞候選
                    // 所使用的搜尋名稱
                    // ====================================
                    let fallbackArtistName =
                        artistName;

                    let fallbackTrackName =
                        songTitle;

                    // ====================================
                    // 是否找到任何同步歌詞
                    // ====================================
                    let hasAnySyncedLyrics = false;


                    // ====================================
                    // 歌名迴圈
                    // ====================================
                    for (
                        const searchTrack of
                        trackSearchNames
                    ) {

                        // ==================================
                        // 歌手迴圈
                        // ==================================
                        for (
                            const searchArtist of
                            artistSearchNames
                        ) {

                            console.log(
                                "🔎 嘗試 LRCLIB：",
                                searchTrack,
                                "×",
                                searchArtist
                            );

                            // ==================================
                            // 實際搜尋 LRCLIB
                            // ==================================
                            const searchCandidates =
                                await searchLRCLIBCandidates(
                                    searchTrack,
                                    searchArtist,
                                    albumName,
                                    duration
                                );

                            // ==================================
                            // 沒有候選
                            // ==================================
                            if (
                                !Array.isArray(searchCandidates) ||
                                searchCandidates.length === 0
                            ) {

                                console.log(
                                    "⚠️ 沒有找到候選，準備嘗試下一個搜尋名稱：",
                                    searchTrack,
                                    "×",
                                    searchArtist
                                );

                                continue;
                            }


                            // ==================================
                            // 判斷目前搜尋結果是否有同步歌詞
                            // ==================================
                            const hasSyncedLyrics =
                                searchCandidates.some(
                                    candidate =>
                                        candidate.syncedLyrics &&
                                        candidate.syncedLyrics.trim()
                                );


                            // ==================================
                            // 找到同步歌詞
                            // ==================================
                            if (hasSyncedLyrics) {

                                hasAnySyncedLyrics = true;

                                console.log(
                                    "🎵 找到同步歌詞候選：",
                                    searchTrack,
                                    "×",
                                    searchArtist,
                                    "共",
                                    searchCandidates.length,
                                    "筆"
                                );

                            }

                            // ==================================
                            // 找到候選，但沒有同步歌詞
                            // ==================================
                            else {

                                console.log(
                                    "📄 找到候選，但沒有同步歌詞：",
                                    searchTrack,
                                    "×",
                                    searchArtist,
                                    "共",
                                    searchCandidates.length,
                                    "筆"
                                );

                                // ==================================
                                // 只保留第一批一般歌詞候選
                                // ==================================
                                if (
                                    fallbackCandidates.length === 0
                                ) {

                                    fallbackCandidates =
                                        searchCandidates;

                                    fallbackTrackName =
                                        searchTrack;

                                    fallbackArtistName =
                                        searchArtist;
                                }
                            }


                            // ==================================
                            // 將這次搜尋找到的候選
                            // 全部加入候選池
                            // ==================================
                            candidates.push(
                                ...searchCandidates
                            );

                            console.log(
                                "📚 目前累積 LRCLIB 候選：",
                                candidates.length,
                                "筆"
                            );
                        }
                    }


                    // ========================================
                    // 所有搜尋完成
                    // ========================================
                    console.log(
                        "🔎 LRCLIB 所有搜尋組合完成：",
                        "共",
                        candidates.length,
                        "筆候選"
                    );


                    // ========================================
                    // 如果有同步歌詞
                    // ========================================
                    //
                    // 只保留有同步歌詞的候選。
                    // 因為同步歌詞優先於一般歌詞。
                    // ========================================
                    if (hasAnySyncedLyrics) {

                        candidates =
                            candidates.filter(
                                candidate =>
                                    candidate.syncedLyrics &&
                                    candidate.syncedLyrics.trim()
                            );

                        console.log(
                            "🎵 已找到同步歌詞，保留同步候選：",
                            candidates.length,
                            "筆"
                        );
                    }


                    // ========================================
                    // 如果完全沒有同步歌詞
                    // 就退回第一批一般歌詞候選
                    // ========================================
                    else if (
                        fallbackCandidates.length > 0
                    ) {

                        candidates =
                            fallbackCandidates;

                        console.log(
                            "↩️ 所有搜尋名稱都沒有同步歌詞，",
                            "退回第一批一般歌詞候選：",
                            fallbackTrackName,
                            "×",
                            fallbackArtistName
                        );
                    }


                    // ====================================
                    // LRCLIB 沒有任何候選
                    // ====================================
                    if (
                        !Array.isArray(candidates) ||
                        candidates.length === 0
                    ) {

                        console.log(
                            "❌ LRCLIB 找不到任何候選歌詞：",
                            songTitle
                        );

                        // ========================================
                        // 清除上一首歌曲留下的候選
                        // ========================================
                        savedLyricCandidates = [];

                        savedSelectedLyricCandidate =
                            null;

                        console.log(
                            "🧹 Background 已清除 LRCLIB 候選"
                        );

                        // ========================================
                        // 通知歌詞視窗清除候選選單
                        // ========================================
                        sendMessageToLyricsWindow({

                            type:
                                "lyricCandidatesUpdated",

                            candidates: [],

                            selectedCandidate: null

                        });

                        sendResponse({

                            success: false,

                            source: "lrclib",

                            loadId,

                            candidates: [],

                            selectedCandidate: null

                        });

                        return;
                    }

                    // ====================================
                    // 選出最佳候選
                    // ====================================
                    const bestCandidate =
                        selectBestLRCLIBCandidate(
                            candidates,
                            songTitle,
                            artistName,
                            albumName,
                            duration
                        );

                    // ====================================
                    // 確認最佳候選存在
                    // ====================================
                    if (!bestCandidate) {

                        console.error(
                            "❌ 無法選出 LRCLIB 最佳候選：",
                            songTitle
                        );

                        sendResponse({

                            success: false,

                            source: "lrclib",

                            loadId,

                            candidates,

                            selectedCandidate: null

                        });

                        return;
                    }

                    // ========================================
                    // 保存目前歌曲的 LRCLIB 候選
                    // ========================================
                    //
                    // 這非常重要。
                    //
                    // content.js 雖然會收到 candidates，
                    // 但 lyrics.html 是獨立視窗，
                    // 它之後可能才透過 requestLyrics
                    // 向 Background 要目前資料。
                    //
                    // 因此 Background 必須自己保存一份。
                    // ========================================
                    savedLyricCandidates =
                        Array.isArray(candidates)
                            ? candidates
                            : [];

                    savedSelectedLyricCandidate =
                        bestCandidate;

                    console.log(
                        "💾 Background 保存 LRCLIB 候選：",
                        savedLyricCandidates.length,
                        "筆"
                    );

                    console.log(
                        "🎯 Background 保存目前選中的候選：",
                        savedSelectedLyricCandidate
                    );

                    // ========================================
                    // 如果歌詞視窗已經存在，
                    // 立即更新候選下拉選單
                    // ========================================
                    sendMessageToLyricsWindow({

                        type:
                            "lyricCandidatesUpdated",

                        candidates:
                            savedLyricCandidates,

                        selectedCandidate:
                            savedSelectedLyricCandidate
                    });

                    // ====================================
                    // 判斷最佳候選的歌詞類型
                    // ====================================
                    let lyricType = null;
                    let lyricText = null;

                    // 優先使用同步歌詞
                    if (
                        bestCandidate.syncedLyrics
                    ) {

                        lyricType = "synced";

                        lyricText =
                            bestCandidate.syncedLyrics;

                    }

                    // 沒有同步歌詞才使用一般歌詞
                    else if (
                        bestCandidate.plainLyrics
                    ) {

                        lyricType = "plain";

                        lyricText =
                            bestCandidate.plainLyrics;

                    }

                    // ====================================
                    // 候選存在，但是完全沒有歌詞
                    // ====================================
                    if (!lyricText) {

                        console.log(
                            "⚠️ 最佳候選沒有可使用的歌詞：",
                            bestCandidate
                        );

                        sendResponse({

                            success: false,

                            source: "lrclib",

                            loadId,

                            candidates,

                            selectedCandidate:
                                bestCandidate

                        });

                        return;
                    }

                    // ====================================
                    // 成功
                    // ====================================
                    console.log(
                        "✅ LRCLIB 最佳候選歌詞準備完成：",
                        {
                            id:
                                bestCandidate.id,

                            originalTrackName:
                                songTitle,

                            originalArtistName:
                                artistName,

                            trackName:
                                bestCandidate.trackName,

                            artistName:
                                bestCandidate.artistName,

                            albumName:
                                bestCandidate.albumName,

                            duration:
                                bestCandidate.duration,

                            lyricType
                        }
                    );

                    // ====================================
                    // 回傳給 content.js
                    // ====================================
                    sendResponse({

                        success: true,

                        source: "lrclib",

                        fileName: null,

                        text: lyricText,

                        lyricType,

                        loadId,

                        // ==================================
                        // 所有候選
                        // ==================================
                        candidates,

                        // ==================================
                        // 自動選中的候選
                        // ==================================
                        selectedCandidate:
                            bestCandidate

                    });

                } catch (error) {

                    console.error(
                        "❌ searchLyrics 發生錯誤：",
                        error
                    );

                    sendResponse({

                        success: false,

                        loadId:
                            message.loadId,

                        candidates: [],

                        selectedCandidate: null

                    });
                }

            })();

            // ====================================
            // 非同步 sendResponse
            // ====================================
            return true;
        }

        if (message.type === "setLyricTimeOffset") {

            const offset =
                Number(message.offset);

            if (!Number.isFinite(offset)) {
                return;
            }

            if (
                lastYtmTabId !== null &&
                lastYtmTabId !== undefined
            ) {

                chrome.tabs.sendMessage(
                    lastYtmTabId,
                    {
                        type: "setLyricTimeOffset",
                        offset: offset
                    }
                ).catch(() => {});
            }

            return;
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
    async (windowId) => {

        // ====================================
        // 不是目前歌詞視窗
        // ====================================
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

        // ====================================
        // 清除記憶體中的 ID
        // ====================================
        lyricsWindowId =
            null;

        console.log(
            "🧹 lyricsWindowId 已清除"
        );

        // ====================================
        // 清除 Storage 中的 ID
        // ====================================
        await chrome.storage.local.remove(
            "lyricsWindowId"
        );

        console.log(
            "🧹 Storage 中的 lyricsWindowId 已清除"
        );

    }
);

// ========================================
// 將歌詞跳轉要求傳送至 YouTube Music
// ========================================
chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (message.type !== "seekToLyricTime") {
            return;
        }

        const time = Number(message.time);

        if (
            !Number.isFinite(time) ||
            time < 0 ||
            !Number.isInteger(lastYtmTabId)
        ) {
            return;
        }

        chrome.tabs.sendMessage(
            lastYtmTabId,
            {
                type: "seekToLyricTime",
                time
            }
        ).catch(() => {});
    }
);

// ========================================
// Background 啟動
// ========================================
(async () => {

    await loadRuntimeState();

    console.log(
        "🚀 YTM Lyrics Background 啟動！"
    );
})();