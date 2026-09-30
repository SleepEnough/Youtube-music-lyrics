(() => {
    if (window.__YTM_LYRICS_PLAYER_TIME__) {
        return;
    }

    window.__YTM_LYRICS_PLAYER_TIME__ = true;

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