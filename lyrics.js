// ========================================
// YTM Lyrics
// 歌詞視窗
// ========================================
console.log("lyrics.js 已載入");

// ========================================
// 記錄目前播放的歌詞
// ========================================
// 很重要！
// 就算歌詞畫面重新建立，
// 我們仍然知道目前播放到哪一句。
// ========================================
let currentLyric = null;

// ========================================
// 使用者是否正在手動捲動
// ========================================
let userScrolling = false;

// ========================================
// 程式是否正在自動捲動
// ========================================
let autoScrolling = false;

// ========================================
// 自動捲動計時器
// ========================================
let autoScrollTimer = null;

// ========================================
// 手動捲動後，自動回到目前歌詞的計時器
// ========================================
let manualScrollReturnTimer = null;

// 等待多久後自動回到目前歌詞
const MANUAL_SCROLL_RETURN_DELAY = 3000;

// ========================================
// LRCLIB 候選歌詞
// ========================================
//
// candidates：目前歌曲的所有 LRCLIB 候選
//
// selectedCandidate：目前正在使用的候選
// ========================================
let lyricCandidates = [];
let selectedLyricCandidate = null;

// ========================================
// 目前歌詞顏色
// ========================================
let lyricColor = "#ff0000";

// ========================================
// 歌詞顯示設定
// ========================================
let lyricFontSize = 18;
let lyricLineHeight = 1.6;
let lyricFontWeight = 400;
let lyricTextAlign = "center";
let backgroundOpacity = 100;

let lyricTimeOffset = 0;

// ========================================
// 接收 Background 傳來的訊息
// ========================================
chrome.runtime.onMessage.addListener((message) => {
    // ====================================
    // 收到整份歌詞
    // ====================================
    if (message.type === "lyricsUpdated"){
        (async () => {
            console.log("🎵 收到歌詞，共", message.lyrics?.length ?? 0, "句");

        // ====================================
        // 如果 Background 傳來空歌詞
        // 表示正在換歌
        // ====================================
        if (!message.lyrics || message.lyrics.length === 0) {
            console.log("🧹 收到空歌詞，清除畫面");

            currentLyric = null;

            // ====================================
            // 換歌時恢復自動同步
            // ====================================
            userScrolling = false;

            if (manualScrollReturnTimer) {
                clearTimeout(
                    manualScrollReturnTimer
                );

                manualScrollReturnTimer = null;
            }

            const lyricsElement = document.querySelector("#lyrics");

            if (lyricsElement) {
                lyricsElement.innerHTML = "";
            }

            return;
        }
        // ====================================
        // 建立新歌歌詞
        // ====================================
        currentLyric = null;

        // ====================================
        // 新歌曲載入時恢復自動同步
        // ====================================
        userScrolling = false;

        await showLyrics(message.lyrics);

        // ====================================
        // 如果已經收到新的目前歌詞
        // 再重新高亮
        // ====================================
        if (currentLyric)
            highlightCurrentLyric(currentLyric);
        })();
    }

    // ====================================
    // 收到目前播放歌詞
    // ====================================
    if (message.type === "currentLyricUpdated"){
        // console.log("🎯 收到目前播放歌詞：", message.lyric);
        // 記住目前歌詞
        currentLyric = message.lyric;
        // 標示目前歌詞
        highlightCurrentLyric(currentLyric);
    }

    // ====================================
    // 收到顯示設定變更
    // ====================================
    if (message.type === "lyricDisplaySettingChanged"){
        console.log("🎨 歌詞顯示設定即時更新：", message.setting, message.value);
        if (message.setting === "fontSize")
            lyricFontSize = Number(message.value);

        if (message.setting === "lineHeight")
            lyricLineHeight = Number(message.value);

        if (message.setting === "fontWeight")
            lyricFontWeight = Number(message.value);

        if (message.setting === "textAlign")
            lyricTextAlign = message.value;

        if (message.setting === "backgroundOpacity")
            backgroundOpacity = Number(message.value);

        applyLyricDisplaySettings();
        applyBackgroundOpacity();
    }

    // ====================================
    // LRCLIB 候選更新
    // ====================================
    if (message.type === "lyricCandidatesUpdated") {
        console.log(
            "📨 lyrics.js 收到訊息：",
            message
        );
        
        updateLyricCandidateSelect(
            message.candidates,
            message.selectedCandidate
        );
    }

    // ====================================
    // 收到歌詞同步偏移變更
    // ====================================
    if (message.type === "setLyricTimeOffset") {

        const offset =
            Number(message.offset);

        if (!Number.isFinite(offset)) {
            return;
        }

        lyricTimeOffset =
            Math.round(
                offset * 10
            ) / 10;

        updateSyncOffsetDisplay();

        console.log(
            "🎚️ 歌詞視窗同步偏移已更新：",
            lyricTimeOffset.toFixed(1),
            "秒"
        );
    }
});

// ========================================
// 顯示整份歌詞
// ========================================
async function showLyrics(lyrics){
    await loadLyricDisplaySettings();

    const lyricsElement = document.querySelector("#lyrics");
    // 如果找不到歌詞容器
    if (!lyricsElement) {
        console.error("❌ 找不到 #lyrics");
        return;
    }
    // 清空原本內容
    lyricsElement.innerHTML = "";
    // ====================================
    // 一句一句建立歌詞
    // ====================================
    for (
        const lyric of lyrics
    ) {

        const line =
            document.createElement(
                "div"
            );


        // 歌詞文字
        line.textContent =
            lyric.text;


        // 把時間存進 HTML
        line.dataset.time = lyric.time;
        line.style.fontSize = lyricFontSize + "px";
        line.style.fontWeight = lyricFontWeight;
        line.style.lineHeight = lyricLineHeight;
        line.style.textAlign = lyricTextAlign;

        // 加入歌詞視窗
        lyricsElement.appendChild(line);
    }


    console.log(
        "📝 歌詞畫面建立完成"
    );


    // ====================================
    // 重要！
    //
    // 如果目前播放歌詞已經知道，
    // 歌詞建立完成後重新標示一次。
    // ====================================

    if (currentLyric) {

        console.log(
            "🔄 歌詞建立完成，重新套用目前歌詞：",
            currentLyric.text
        );


        highlightCurrentLyric(
            currentLyric
        );
    }
}

// ========================================
// 標示目前播放的歌詞
// ========================================
function highlightCurrentLyric(lyric){

    // 如果沒有目前歌詞
    if (!lyric)
        return;

    // 找到所有歌詞
    const lines =
        document.querySelectorAll(
            "#lyrics div"
        );

    // 如果歌詞還沒建立
    if (lines.length === 0) {

        console.log(
            "⏳ 歌詞元素還沒建立，稍後再套用"
        );

        return;
    }

    // ====================================
    // 找到目前歌詞的位置
    // ====================================
    let currentIndex = -1;

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const time =
            parseFloat(
                lines[i].dataset.time
            );

        if (
            Math.abs(
                time - lyric.time
            ) < 0.01
        ) {

            currentIndex = i;

            break;
        }
    }

    // ====================================
    // 找不到目前歌詞
    // ====================================
    if (currentIndex === -1) {

        console.log(
            "⚠️ 找不到對應的目前歌詞：",
            lyric
        );

        return;
    }

    // ====================================
    // 一句一句套用視覺層級
    // ====================================
    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line = lines[i];

        // =================================
        // 計算與目前歌詞的距離
        // =================================
        const distance =
            Math.abs(
                i - currentIndex
            );

        // =================================
        // 先清除舊的視覺 class
        // =================================
        line.classList.remove(
            "current",
            "lyric-near",
            "lyric-near-2",
            "lyric-far"
        );

        // =================================
        // 目前歌詞
        // =================================
        if (distance === 0) {

            console.log(
                "🔴 找到目前歌詞：",
                line.textContent
            );

            line.classList.add(
                "current"
            );

            // =================================
            // 保留目前歌詞的使用者設定
            // =================================
            line.style.color =
                lyricColor;

            line.style.fontWeight =
                lyricFontWeight;

            line.style.fontSize =
                lyricFontSize + "px";

            line.style.textAlign =
                lyricTextAlign;

            // =================================
            // 自動捲動
            // =================================
            if (!userScrolling) {

                // 清除上一個自動捲動計時器
                if (autoScrollTimer) {

                    clearTimeout(
                        autoScrollTimer
                    );
                }

                // 開始自動捲動
                autoScrolling = true;

                line.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                // 自動捲動完成
                autoScrollTimer =
                    setTimeout(() => {

                        autoScrolling = false;

                        autoScrollTimer = null;

                    }, 500);
            }

        }

        // =================================
        // 前後第一句
        // =================================
        else if (
            distance === 1
        ) {

            line.classList.add(
                "lyric-near"
            );
        }

        // =================================
        // 前後第二句
        // =================================
        else if (
            distance === 2
        ) {

            line.classList.add(
                "lyric-near-2"
            );
        }

        // =================================
        // 距離三句以上
        // =================================
        else {

            line.classList.add(
                "lyric-far"
            );
        }

        // =================================
        // 非目前歌詞
        // 保留使用者的顯示設定
        // =================================
        if (distance !== 0) {

            line.style.fontWeight =
                lyricFontWeight;

            line.style.fontSize =
                lyricFontSize + "px";

            line.style.textAlign =
                lyricTextAlign;

            // 清除目前歌詞的 inline 顏色
            line.style.color = "";
        }
    }

}


// ========================================
// 歌詞視窗拖曳功能
// ========================================
document.addEventListener("DOMContentLoaded",async () => {
    // console.log("開始初始化視窗拖曳功能");

    // // ====================================
    // // 找到控制列
    // // ====================================
    // const titleBar = document.querySelector("#titleBar");

    // // 確認控制列是否存在
    // if (!titleBar) {
    //     console.error("❌ 找不到 #titleBar");
    //     return;
    // }

    // console.log("✅ 找到 #titleBar");

    // // ====================================
    // // 拖曳狀態
    // // ====================================
    // let isDragging = false;

    // // 滑鼠上一個位置
    // let startMouseX = 0;
    // let startMouseY = 0;

    // // ====================================
    // // 開始拖曳
    // // ====================================
    // titleBar.addEventListener("mousedown", (event) => {
    //     console.log("🖱️ 開始拖曳");
    //     isDragging = true;
    //     startMouseX = event.screenX;
    //     startMouseY = event.screenY;
    // });

    // // ====================================
    // // 滑鼠移動
    // // ====================================
    // document.addEventListener("mousemove", (event) => {
    //     // 沒有拖曳就不處理
    //     if (!isDragging){
    //         return;
    //     }

    //     // 計算移動距離
    //     const deltaX = event.screenX - startMouseX;
    //     const deltaY = event.screenY - startMouseY;

    //     console.log("🖱️ 移動：", deltaX, deltaY);

    //     // 更新滑鼠位置
    //     startMouseX = event.screenX;
    //     startMouseY = event.screenY;

    //     // ====================================
    //     // 傳給 Background
    //     // ====================================
    //     chrome.runtime.sendMessage({
    //         type:"moveLyricsWindow",
    //         deltaX:deltaX,
    //         deltaY:deltaY});
    // });

    // // ====================================
    // // 滑鼠放開
    // // ====================================
    // document.addEventListener("mouseup", () => {
    //     if (!isDragging) {
    //         return;
    //     }

    //     console.log("🖱️ 結束拖曳");
        
    //     isDragging = false;

    //     chrome.runtime.sendMessage({
    //         type:"saveLyricsWindowPosition",});
    //     });

    // ====================================
    // 向 Background 要目前歌詞
    // ====================================
    console.log("歌詞視窗已載入，要求目前歌詞資料");

    try {
        const response =
            await chrome.runtime.sendMessage({
                type:
                    "requestLyrics"
            });

        console.log(
            "📨 Background 回傳目前歌詞資料：",
            response
        );

        console.log(
            "📊 Background 歌詞數量：",
            response?.lyrics?.length
        );
        
        console.log(
            "🎯 Background 目前歌詞：",
            response?.currentLyric
        );

        if (
            response &&
            response.lyrics &&
            response.lyrics.length > 0
        ) {
            console.log(
                "🎵 載入目前歌詞，共",
                response.lyrics.length,
                "句"
            );

            await showLyrics(
                response.lyrics
            );
        }

        // ========================================
        // 載入目前歌曲的 LRCLIB 候選
        // ========================================
        if (
            response &&
            Array.isArray(
                response.candidates
            )
        ) {

            console.log(
                "📚 載入目前 LRCLIB 候選：",
                response.candidates.length,
                "筆"
            );

            updateLyricCandidateSelect(
                response.candidates,
                response.selectedCandidate
            );
        }

        if (response && response.currentLyric) {
            currentLyric =
                response.currentLyric;

            highlightCurrentLyric(
                currentLyric
            );
        }
    } catch (error) {
        console.error(
            "❌ 取得目前歌詞資料失敗：",
            error
        );
    }
});

// ========================================
// 偵測使用者手動捲動歌詞
// ========================================
const lyricsElement = document.querySelector("#lyrics");

if (lyricsElement) {
    lyricsElement.addEventListener("scroll", () => {

        // ====================================
        // 程式自己捲動
        // ====================================
        if (autoScrolling)
            return;

        // ====================================
        // 使用者手動捲動
        // ====================================
        console.log(
            "🖱️ 使用者正在手動捲動歌詞"
        );

        userScrolling = true;

        // ====================================
        // 清除上一個自動返回計時器
        // ====================================
        if (
            manualScrollReturnTimer
        ) {

            clearTimeout(
                manualScrollReturnTimer
            );
        }

        // ====================================
        // 開始重新計時
        // ====================================
        manualScrollReturnTimer =
            setTimeout(() => {

                console.log(
                    "⏰ 使用者停止捲動 3 秒"
                );

                // =================================
                // 回到目前播放歌詞
                // =================================
                if (currentLyric) {

                    console.log(
                        "🔄 自動回到目前播放歌詞：",
                        currentLyric.text
                    );

                    // =================================
                    // 先允許自動捲動
                    // =================================
                    userScrolling = false;

                    // =================================
                    // 找到目前歌詞
                    // =================================
                    highlightCurrentLyric(
                        currentLyric
                    );
                }

                manualScrollReturnTimer =
                    null;

            }, MANUAL_SCROLL_RETURN_DELAY);

        // ====================================
        // 檢查目前歌詞是否已經回到附近
        // ====================================
        checkAutoScrollResume();
    });
}

// ========================================
// 檢查是否恢復自動捲動
// ========================================
function checkAutoScrollResume() {

    // 沒有目前歌詞
    if (!currentLyric) {

        return;
    }


    // 沒有歌詞容器
    if (!lyricsElement) {

        return;
    }


    // 找到所有歌詞
    const lines =
        lyricsElement.querySelectorAll(
            "div"
        );


    // ====================================
    // 找目前播放的歌詞
    // ====================================

    for (const line of lines) {

        const time =
            parseFloat(
                line.dataset.time
            );


        // 不是目前歌詞
        if (
            Math.abs(
                time -
                currentLyric.time
            ) >= 0.01
        ) {

            continue;
        }


        // ====================================
        // 計算目前歌詞的位置
        // ====================================

        const lineTop =
            line.offsetTop;


        const scrollTop =
            lyricsElement.scrollTop;


        const containerHeight =
            lyricsElement.clientHeight;


        const lineCenter =
            lineTop +
            line.offsetHeight / 2;


        const containerCenter =
            scrollTop +
            containerHeight / 2;


        // ====================================
        // 計算距離
        // ====================================

        const distance =
            Math.abs(
                lineCenter -
                containerCenter
            );

        // console.log("📏 目前歌詞距離中央：", Math.round(distance), "px");

        // ====================================
        // 如果目前歌詞已經接近中央
        // ====================================

        if (distance < 100) {

            console.log(
                "🔄 已回到目前歌詞附近，恢復自動捲動"
            );


            userScrolling =
                false;
        }


        return;
    }
}

// ========================================
// 讀取歌詞顏色
// ========================================
async function loadLyricColor() {

    try {
        const result = await chrome.storage.local.get("lyricColor");

        if (result.lyricColor){
            lyricColor = result.lyricColor;
        }
        console.log("🎨 目前歌詞顏色：", lyricColor);
    } catch (error) {
        console.error("❌ 讀取歌詞顏色失敗：", error);
    }
}

// ========================================
// 讀取歌詞顯示設定
// ========================================
async function loadLyricDisplaySettings() {
    try {
        const result =
            await chrome.storage.local.get([
                "fontSize",
                "lineHeight",
                "fontWeight",
                "textAlign",
                "backgroundOpacity"
            ]);

        lyricFontSize = result.fontSize ?? 18;

        lyricLineHeight = result.lineHeight ?? 1.6;

        lyricFontWeight = result.fontWeight ?? 400;

        lyricTextAlign = result.textAlign ?? "center";

        backgroundOpacity = result.backgroundOpacity ?? 100;

        console.log("🔤 歌詞顯示設定已載入：",
            {
                fontSize:lyricFontSize,
                lineHeight:lyricLineHeight,
                fontWeight:lyricFontWeight,
                textAlign:lyricTextAlign
            });
    } catch (error) {
        console.error("❌ 載入歌詞顯示設定失敗：", error);
    }
}

// ========================================
// 套用歌詞顯示設定
// ========================================
function applyLyricDisplaySettings() {

    const lines = document.querySelectorAll("#lyrics div");

    console.log("🎨 套用歌詞顯示設定，共", lines.length, "句");

    for (const line of lines) {
        line.style.fontSize = lyricFontSize + "px";
        line.style.lineHeight = lyricLineHeight;
        line.style.fontWeight = lyricFontWeight;
        line.style.textAlign = lyricTextAlign;
    }

    // ====================================
    // 重新套用目前歌詞
    // ====================================
    if (currentLyric)
        highlightCurrentLyric(currentLyric);
}

// ========================================
// 套用背景透明度
// ========================================
function applyBackgroundOpacity() {

    const opacity = backgroundOpacity / 100;

    document.body.style.setProperty("--background-opacity", opacity);

    console.log("🌫️ 背景透明度：", backgroundOpacity + "%");
}

// ========================================
// LRCLIB 候選歌詞下拉選單
// ========================================
const lyricCandidateSelect = document.getElementById("lyricCandidateSelect");

// ========================================
// 建立 LRCLIB 候選歌詞下拉選單
// ========================================
//
// 功能：
// 將 Background / content.js 傳來的
// LRCLIB 候選資料建立成 <select> 選項。
//
// 如果沒有候選，選單會自動隱藏。
// ========================================
function updateLyricCandidateSelect(
    candidates,
    selectedCandidate
) {

    console.log(
        "📚 更新 LRCLIB 候選選單：",
        candidates
    );

    if (
        !lyricCandidateSelect
    ) {

        console.error(
            "❌ 找不到 lyricCandidateSelect"
        );

        return;
    }

    // ====================================
    // 清除舊選項
    // ====================================
    lyricCandidateSelect.innerHTML = "";

    // ====================================
    // 沒有候選 → 隱藏選單
    // ====================================
    if (
        !Array.isArray(candidates) ||
        candidates.length === 0
    ) {
        lyricCandidateSelect.style.display =
        "none";

        lyricCandidates = [];

        selectedLyricCandidate =
            null;

        return;
    }

    // ====================================
    // 保存候選資料
    // ====================================
    lyricCandidates =
        candidates;

    selectedLyricCandidate =
        selectedCandidate || null;

    // ====================================
    // 建立每一個候選選項
    // ====================================
    candidates.forEach(
        (candidate, index) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                candidate.id;

            // =================================
            // 顯示名稱
            // =================================
            //
            // 格式：
            //
            // ① 歌名 - 歌手
            //
            // 如果有專輯，也一起顯示。
            // =================================

            let label =
                `${candidate.trackName || "未知歌曲"}`
                + ` - `
                + `${candidate.artistName || "未知歌手"}`;

            if (
                candidate.albumName
            ) {

                label +=
                    ` [${candidate.albumName}]`;
            }

            // 顯示是否有同步歌詞
            if (
                candidate.hasSyncedLyrics
            ) {

                label +=
                    " 🎵";

            } else if (
                candidate.hasPlainLyrics
            ) {

                label +=
                    " 📝";
            }

            option.textContent =
                `${index + 1}. ${label}`;

            // =================================
            // 設定目前選中的候選
            // =================================
            if (
                selectedCandidate &&
                String(
                    selectedCandidate.id
                ) ===
                String(candidate.id)
            ) {

                option.selected =
                    true;
            }

            lyricCandidateSelect.appendChild(
                option
            );
        }
    );

    // ====================================
    // 顯示選單
    // ====================================
    lyricCandidateSelect.style.display =
        "inline-block";

    console.log(
        "✅ LRCLIB 候選選單建立完成，共",
        candidates.length,
        "筆"
    );
}

// ========================================
// LRCLIB 候選選擇事件
// ========================================
//
// 使用者在下拉選單選擇其他歌詞後：
//
// lyrics.js
//     ↓
// Background
//     ↓
// content.js
//
// 真正的歌詞切換由 content.js 完成。
// ========================================
if (lyricCandidateSelect) {
    lyricCandidateSelect.addEventListener(
        "change",
        () => {

            const candidateId =
                lyricCandidateSelect.value;

            console.log(
                "🎯 使用者選擇 LRCLIB 候選：",
                candidateId
            );

            if (!candidateId) {
                return;
            }

            // =================================
            // 找到目前選中的候選
            // =================================
            const candidate =
                lyricCandidates.find(
                    (item) =>
                        String(item.id) ===
                        String(candidateId)
                );

            if (
                candidate
            ) {

                selectedLyricCandidate =
                    candidate;
            }

            // =================================
            // 傳給 Background
            // =================================
            chrome.runtime.sendMessage({

                type:
                    "selectLyricCandidate",

                candidateId:
                    candidateId

            });
        }
    );
}

const syncMinus1 =
    document.getElementById("syncMinus1");

const syncMinus01 =
    document.getElementById("syncMinus01");

const syncPlus01 =
    document.getElementById("syncPlus01");

const syncPlus1 =
    document.getElementById("syncPlus1");

const syncOffset =
    document.getElementById("syncOffset");


function updateSyncOffsetDisplay() {

    syncOffset.textContent =
        `偏移：${lyricTimeOffset.toFixed(1)}s`;

}


function changeSyncOffset(delta) {

    lyricTimeOffset += delta;

    lyricTimeOffset =
        Math.round(
            lyricTimeOffset * 10
        ) / 10;

    updateSyncOffsetDisplay();

    chrome.runtime.sendMessage({

        type: "setLyricTimeOffset",

        offset: lyricTimeOffset

    });

}


syncMinus1.addEventListener(
    "click",
    () => changeSyncOffset(-1.0)
);

syncMinus01.addEventListener(
    "click",
    () => changeSyncOffset(-0.1)
);

syncPlus01.addEventListener(
    "click",
    () => changeSyncOffset(0.1)
);

syncPlus1.addEventListener(
    "click",
    () => changeSyncOffset(1.0)
);


updateSyncOffsetDisplay();

(async () => {
    await loadLyricColor();
    await loadLyricDisplaySettings();
    applyBackgroundOpacity();
})();