// ========================================
// YTM Lyrics - 設定頁
// ========================================


// ========================================
// HTML 元素
// ========================================

const selectFolderButton = document.querySelector("#selectFolder");

const lyricColorPicker = document.querySelector("#lyricColor");

const reconnectFolderButton = document.querySelector("#reconnectFolder");

const folderName = document.querySelector("#folderName");

const fileList = document.querySelector("#fileList");

const fontSizeControl = document.querySelector("#fontSize");

const fontSizeValue = document.querySelector("#fontSizeValue");

const lineHeightControl = document.querySelector("#lineHeight");

const lineHeightValue = document.querySelector("#lineHeightValue");

const fontWeightControl = document.querySelector("#fontWeight");

const textAlignControl = document.querySelector("#textAlign");

// ========================================
// 歌詞顯示設定預設值
// ========================================

const DEFAULT_FONT_SIZE = 18;

const DEFAULT_LINE_HEIGHT = 1.6;

const DEFAULT_FONT_WEIGHT = 400;

const DEFAULT_TEXT_ALIGN = "center";

// ========================================
// IndexedDB
// 用來保存資料夾 Handle
// ========================================

const DB_NAME = "YTM-Lyrics";

const STORE_NAME = "settings";


// 開啟資料庫
function openDatabase() {

    return new Promise((resolve, reject) => {

        const request =
            indexedDB.open(DB_NAME, 1);


        // 第一次建立資料庫
        request.onupgradeneeded = () => {

            const db =
                request.result;


            // 建立儲存區
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


        // 開啟成功
        request.onsuccess = () => {

            resolve(
                request.result
            );
        };


        // 開啟失敗
        request.onerror = () => {

            reject(
                request.error
            );
        };
    });
}


// ========================================
// 儲存資料夾
// ========================================

async function saveFolderHandle(
    folderHandle
) {

    const db =
        await openDatabase();


    return new Promise(
        (resolve, reject) => {

            const transaction =
                db.transaction(
                    STORE_NAME,
                    "readwrite"
                );


            const store =
                transaction.objectStore(
                    STORE_NAME
                );


            store.put(
                folderHandle,
                "lyricsFolder"
            );


            transaction.oncomplete =
                () => {

                    resolve();
                };


            transaction.onerror =
                () => {

                    reject(
                        transaction.error
                    );
                };
        }
    );
}


// ========================================
// 讀取資料夾
// ========================================

async function loadFolderHandle() {

    const db =
        await openDatabase();


    return new Promise(
        (resolve, reject) => {

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


            request.onsuccess =
                () => {

                    resolve(
                        request.result
                    );
                };


            request.onerror =
                () => {

                    reject(
                        request.error
                    );
                };
        }
    );
}


// ========================================
// 選擇資料夾
// ========================================

selectFolderButton.addEventListener(
    "click",
    async () => {

        try {

            // 開啟資料夾選擇
            const folderHandle =
                await window.showDirectoryPicker();


            // ========================================
            // 確認資料夾讀取權限
            // ========================================

            const permission =
                await folderHandle.requestPermission({
                    mode: "read"
                });


            if (permission !== "granted") {

                console.error(
                    "❌ 使用者沒有授予歌詞資料夾讀取權限"
                );

                return;
            }

            console.log("✅ 歌詞資料夾讀取權限已取得");

            // ========================================
            // 保存資料夾
            // ========================================

            await saveFolderHandle(
                folderHandle
            );


            // 顯示名稱
            folderName.textContent =
                "目前資料夾：" +
                folderHandle.name;


            // 讀取歌詞
            await readLyricsFolder(
                folderHandle
            );


        } catch (error) {

            console.error(
                "❌ 選擇資料夾失敗：",
                error
            );
        }
    }
);


// ========================================
// 讀取歌詞資料夾
// ========================================

async function readLyricsFolder(
    folderHandle
) {

    fileList.textContent =
        "📂 正在讀取...\n";


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


        const fileName =
            entry.name;


        // 只處理 .lrc
        if (
            !fileName
                .toLowerCase()
                .endsWith(".lrc")
        ) {
            continue;
        }


        console.log(
            "📄 找到歌詞檔：",
            fileName
        );


        const file =
            await entry.getFile();


        const text =
            await file.text();


        fileList.textContent +=
            "\n🎵 " +
            fileName +
            "\n";


        fileList.textContent +=
            text +
            "\n";
    }


    fileList.textContent +=
        "\n✅ 讀取完成！";
}


// ========================================
// 頁面載入時
// 嘗試找回之前的資料夾
// ========================================

async function restoreFolder() {

    try {

        // 找回之前保存的資料夾
        const folderHandle =
            await loadFolderHandle();


        // 沒有保存過
        if (!folderHandle) {

            console.log(
                "📁 尚未設定歌詞資料夾"
            );

            return;
        }


        console.log(
            "📁 找到之前設定的資料夾：",
            folderHandle.name
        );


        // ====================================
        // 檢查目前權限
        // ====================================

        const permission =
            await folderHandle.queryPermission({
                mode: "read"
            });


        console.log(
            "📁 目前資料夾權限：",
            permission
        );


        // ====================================
        // 已經有權限
        // ====================================

        if (permission === "granted") {

            folderName.textContent =
                "已設定資料夾：" +
                folderHandle.name;


            console.log(
                "✅ 歌詞資料夾可以使用"
            );


            // 隱藏重新授權按鈕
            reconnectFolderButton.style.display =
                "none";


            // 讀取歌詞
            await readLyricsFolder(
                folderHandle
            );


            return;
        }


        // ====================================
        // 沒有權限
        // ====================================

        console.log(
            "🔐 歌詞資料夾需要重新授權"
        );


        folderName.textContent =
            "⚠️ 歌詞資料夾需要重新授權";


        // 顯示重新授權按鈕
        reconnectFolderButton.style.display =
            "inline-block";


    } catch (error) {

        console.error(
            "❌ 無法讀取設定：",
            error
        );
    }
}

// ========================================
// 重新授權歌詞資料夾
// ========================================

reconnectFolderButton.addEventListener("click", async () => {
    try {
        console.log("🔓 使用者要求重新授權");
        // 找回之前保存的資料夾
        const folderHandle = await loadFolderHandle();

        if (!folderHandle) {
            console.log("❌ 找不到之前的資料夾");
            return;
        }
        // ====================================
        // 這裡可以安全 requestPermission
        // 因為是使用者點擊按鈕
        // ====================================
        const permission = await folderHandle.requestPermission({mode: "read"});

        console.log("🔐 重新取得權限結果：", permission);
        // ====================================
        // 授權成功
        // ====================================
        if (permission === "granted"){
            console.log("✅ 歌詞資料夾重新授權成功");

            folderName.textContent = "已設定資料夾：" + folderHandle.name;
            // 隱藏按鈕
            reconnectFolderButton.style.display = "none";
            // 重新讀取歌詞
            await readLyricsFolder(folderHandle);
            }
            else{
                console.log("❌ 使用者沒有授權歌詞資料夾");
                folderName.textContent = "⚠️ 尚未取得資料夾權限";
            }
        } catch (error) {
            console.error("❌ 重新授權失敗：", error);
        }
    }
);

// ========================================
// 載入歌詞顏色
// ========================================

async function loadLyricColor() {
    try {
        const result = await chrome.storage.local.get("lyricColor");

        const color = result.lyricColor || "#ff0000";

        if (lyricColorPicker)
            lyricColorPicker.value = color;
        
        console.log("🎨 載入歌詞顏色：", color);
    } catch (error) {
        console.error("❌ 載入歌詞顏色失敗：", error);
    }
}

// ========================================
// 修改歌詞顏色
// ========================================
if (lyricColorPicker) {
    lyricColorPicker.addEventListener("change", async () => {
        const color = lyricColorPicker.value;

        console.log("🎨 設定歌詞顏色：", color);

        await chrome.storage.local.set({lyricColor:color});

        console.log("💾 歌詞顏色已儲存");
    });
}

// ========================================
// 載入歌詞顯示設定
// ========================================
async function loadLyricDisplaySettings() {
    try {
        const result = await chrome.storage.local.get([
            "fontSize",
            "lineHeight",
            "fontWeight",
            "textAlign"
        ]);

        const fontSize = result.fontSize ?? DEFAULT_FONT_SIZE;
        const lineHeight = result.lineHeight ?? DEFAULT_LINE_HEIGHT;
        const fontWeight = result.fontWeight ?? DEFAULT_FONT_WEIGHT;
        const textAlign = result.textAlign ?? DEFAULT_TEXT_ALIGN;

        // ================================
        // 更新 UI
        // ================================

        if (fontSizeControl)
            fontSizeControl.value = fontSize;

        if (fontSizeValue)
            fontSizeValue.textContent = fontSize + "px";

        if (lineHeightControl)
            lineHeightControl.value = lineHeight;

        if (lineHeightValue)
            lineHeightValue.textContent = lineHeight;

        if (fontWeightControl)
            fontWeightControl.value = fontWeight;

        if(textAlignControl)
            textAlign.value = textAlign;

        console.log("🔤 歌詞顯示設定：",
            {
                fontSize,
                lineHeight,
                fontWeight,
                textAlign
            });
    } catch (error) {
        console.error("❌ 讀取歌詞顯示設定失敗：", error);
    }
}

if (fontSizeControl) {
    fontSizeControl.addEventListener("input", async () => {
        const value = Number(fontSizeControl.value);

        fontSizeValue.textContent = value + "px";

        console.log("🔤 字體大小：", value);

        await chrome.storage.local.set({fontSize: value});

        chrome.runtime.sendMessage({
            type: "lyricDisplaySettingChanged",
            setting: "fontSize",
            value: value
        });
    });
}

if (lineHeightControl){
    lineHeightControl.addEventListener("input", async () => {
        const value = Number(lineHeightControl.value);

        lineHeightValue.textContent = value;
        
        console.log("↕️ 歌詞行距：", value);

        await chrome.storage.local.set({lineHeight: value});

        chrome.runtime.sendMessage({
            type:"lyricDisplaySettingChanged",
            setting:"lineHeight",
            value:value
        });
    });
}

if (fontWeightControl) {
    fontWeightControl.addEventListener("change", async () => {
        const value =Number(fontWeightControl.value);

        console.log("🅱️ 歌詞粗細：", value);

        await chrome.storage.local.set({fontWeight: value});
        
        chrome.runtime.sendMessage({
            type:"lyricDisplaySettingChanged",
            setting:"fontWeight",
            value:value
        });
    });
}

if (textAlignControl) {
    textAlignControl.addEventListener("change", async () => {
        const value = textAlignControl.value;

        await chrome.storage.local.set({textAlign: value});

        console.log("↔️ 歌詞文字對齊：", value);

        chrome.runtime.sendMessage({
            type:"lyricDisplaySettingChanged",
            setting:"textAlign",
            value:value
        });
    });
}

// 啟動
restoreFolder();

loadLyricColor();

loadLyricDisplaySettings();