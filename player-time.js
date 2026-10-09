(() => {
    if (window.__YTM_LYRICS_PLAYER_TIME__) {
        return;
    }

    window.__YTM_LYRICS_PLAYER_TIME__ = true;

    // ========================================
    // 接收歌詞跳轉要求並控制 YouTube 播放器
    // ========================================
    window.addEventListener("message", (event) => {
        if (
            event.source !== window ||
            event.data?.type !== "YTM_LYRICS_SEEK"
        ) {
            return;
        }

        const time = Number(event.data.time);

        if (
            !Number.isFinite(time) ||
            time < 0
        ) {
            return;
        }

        const moviePlayer =
            document.getElementById("movie_player");

        if (
            moviePlayer &&
            typeof moviePlayer.seekTo === "function"
        ) {
            moviePlayer.seekTo(time, true);
        }
    });

    setInterval(() => {
        const moviePlayer =
            document.getElementById("movie_player");

        if (
            !moviePlayer ||
            typeof moviePlayer.getCurrentTime !== "function"
        ) {
            return;
        }

        let currentTime = null;
        let playerState = null;

        try {
            currentTime =
                moviePlayer.getCurrentTime();

            if (
                typeof moviePlayer.getPlayerState ===
                "function"
            ) {
                playerState =
                    moviePlayer.getPlayerState();
            }
        } catch (error) {
            return;
        }

        window.postMessage(
            {
                type:
                    "YTM_LYRICS_PLAYER_TIME",
                currentTime,
                playerState
            },
            "*"
        );
    }, 50);
})();