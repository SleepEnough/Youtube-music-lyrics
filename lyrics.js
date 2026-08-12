// ========================================
// YTM Lyrics
// 歌詞視窗
// ========================================

console.log(
    "🪟 lyrics.js 已載入"
);


// ========================================
// 記錄目前播放的歌詞
// ========================================
//
// 很重要！
//
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
// 目前歌詞顏色
// ========================================

let lyricColor = "#ff0000";

// ========================================
// 接收 Background 傳來的訊息
// ========================================

chrome.runtime.onMessage.addListener(
    (message) => {

        console.log(
            "📨 歌詞視窗收到訊息：",
            message.type
        );


        // ====================================
        // 收到整份歌詞
        // ====================================

        if (
            message.type ===
            "lyricsUpdated"
        ) {

            console.log(
                "🎵 收到歌詞，共",
                message.lyrics.length,
                "句"
            );


            // 建立歌詞畫面
            showLyrics(
                message.lyrics
            );


            // -------------------------------
            // 很重要
            // -------------------------------
            //
            // 如果目前已經知道正在播放哪一句，
            // 歌詞重新建立後，
            // 立刻再套用一次高亮。
            //

            if (currentLyric) {

                highlightCurrentLyric(
                    currentLyric
                );
            }
        }


        // ====================================
        // 收到目前播放歌詞
        // ====================================

        if (
            message.type ===
            "currentLyricUpdated"
        ) {

            console.log(
                "🎯 收到目前播放歌詞：",
                message.lyric
            );


            // 記住目前歌詞
            currentLyric =
                message.lyric;


            // 標示目前歌詞
            highlightCurrentLyric(
                currentLyric
            );
        }

    }
);


// ========================================
// 顯示整份歌詞
// ========================================

function showLyrics(
    lyrics
) {

    const lyricsElement =
        document.querySelector(
            "#lyrics"
        );


    // 如果找不到歌詞容器
    if (!lyricsElement) {

        console.error(
            "❌ 找不到 #lyrics"
        );

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
        line.dataset.time =
            lyric.time;


        // 加入歌詞視窗
        lyricsElement.appendChild(
            line
        );
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

function highlightCurrentLyric(
    lyric
) {

    // 如果沒有目前歌詞
    if (!lyric) {

        return;
    }


    console.log(
        "🎯 開始標示目前歌詞：",
        lyric
    );


    // 找到所有歌詞
    const lines =
        document.querySelectorAll(
            "#lyrics div"
        );


    console.log(
        "🔎 找到歌詞元素：",
        lines.length
    );


    // 如果歌詞還沒建立
    if (lines.length === 0) {

        console.log(
            "⏳ 歌詞元素還沒建立，稍後再套用"
        );

        return;
    }


    // 一句一句檢查
    for (const line of lines) {

        // 取得這一句的時間
        const time =
            parseFloat(line.dataset.time);

        // 比較時間
        const isCurrent = Math.abs(time - lyric.time) < 0.01;

        // ====================================
        // 是目前播放的歌詞
        // ====================================

        if (isCurrent) {
            console.log("🔴 找到目前歌詞：", line.textContent);

            line.classList.add("current");

            // 直接套用樣式
            line.style.color = lyricColor;
            line.style.fontWeight = "bold";
            line.style.fontSize = "1.2em";

            // ====================================
            // 自動捲動
            // ====================================
            if (!userScrolling) {
                autoScrolling = true;
                line.scrollIntoView({behavior: "smooth", block: "center"});
                setTimeout(() => {autoScrolling = false;}, 500);
            }
        }
        // ====================================
        // 不是目前播放的歌詞
        // ====================================
        else {
            line.classList.remove("current");
            // 清除樣式
            line.style.color = "";
            line.style.fontWeight = "";
            line.style.fontSize = "";
        }
    }
}

// ========================================
// 永遠置頂
// ========================================

// const alwaysOnTopCheckbox =
//     document.querySelector(
//         "#alwaysOnTop"
//     );


// alwaysOnTopCheckbox.addEventListener(
//     "change",
//     () => {

//         console.log(
//             "📌 永遠置頂：",
//             alwaysOnTopCheckbox.checked
//         );


//         chrome.runtime.sendMessage({

//             type:
//                 "setAlwaysOnTop",

//             value:
//                 alwaysOnTopCheckbox.checked

//         });

//     }
// );

// ========================================
// 歌詞視窗拖曳功能
// ========================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "🪟 開始初始化視窗拖曳功能"
        );


        // ====================================
        // 找到控制列
        // ====================================

        const titleBar =
            document.querySelector(
                "#titleBar"
            );


        // 確認控制列是否存在
        if (!titleBar) {

            console.error(
                "❌ 找不到 #titleBar"
            );

            return;
        }


        console.log(
            "✅ 找到 #titleBar"
        );


        // ====================================
        // 拖曳狀態
        // ====================================

        let isDragging =
            false;


        // 滑鼠上一個位置
        let startMouseX =
            0;

        let startMouseY =
            0;


        // ====================================
        // 開始拖曳
        // ====================================

        titleBar.addEventListener(
            "mousedown",
            (event) => {

                console.log(
                    "🖱️ 開始拖曳"
                );


                isDragging =
                    true;


                startMouseX =
                    event.screenX;

                startMouseY =
                    event.screenY;

            }
        );


        // ====================================
        // 滑鼠移動
        // ====================================

        document.addEventListener(
            "mousemove",
            (event) => {

                // 沒有拖曳就不處理
                if (!isDragging) {

                    return;
                }


                // 計算移動距離
                const deltaX =
                    event.screenX -
                    startMouseX;


                const deltaY =
                    event.screenY -
                    startMouseY;


                console.log(
                    "🖱️ 移動：",
                    deltaX,
                    deltaY
                );


                // 更新滑鼠位置
                startMouseX =
                    event.screenX;

                startMouseY =
                    event.screenY;


                // ====================================
                // 傳給 Background
                // ====================================

                chrome.runtime.sendMessage({

                    type:
                        "moveLyricsWindow",

                    deltaX:
                        deltaX,

                    deltaY:
                        deltaY

                });

            }
        );


        // ====================================
        // 滑鼠放開
        // ====================================

        document.addEventListener(
            "mouseup",
            () => {

                if (!isDragging) {

                    return;
                }


                console.log(
                    "🖱️ 結束拖曳"
                );


                isDragging =
                    false;

            }
        );

    }
);

// ========================================
// 偵測使用者手動捲動歌詞
// ========================================

const lyricsElement =
document.querySelector(
    "#lyrics"
);


if (lyricsElement) {

    lyricsElement.addEventListener(
        "scroll",
        () => {

            // ====================================
            // 程式自己捲動
            // ====================================

            if (autoScrolling) {

                return;
            }


            // ====================================
            // 使用者手動捲動
            // ====================================

            console.log(
                "🖱️ 使用者正在手動捲動歌詞"
            );


            userScrolling =
                true;


            // ====================================
            // 檢查目前歌詞是否已經回到附近
            // ====================================
            checkAutoScrollResume();
        }
    );
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


        console.log(
            "📏 目前歌詞距離中央：",
            Math.round(distance),
            "px"
        );


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

        const result =
            await chrome.storage.local.get(
                "lyricColor"
            );


        if (result.lyricColor) {
            lyricColor =
                result.lyricColor;
        }

        console.log("🎨 目前歌詞顏色：", lyricColor);
    } catch (error) {
        console.error("❌ 讀取歌詞顏色失敗：", error);
    }
}

loadLyricColor();