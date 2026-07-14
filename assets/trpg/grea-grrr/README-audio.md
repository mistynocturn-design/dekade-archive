# TRPG 오디오 넣는 법

세션별 MP3 파일은 각각 `01/audio`, `02/audio` 폴더에 넣습니다. 각 로그 문서의 front matter에 아래처럼 곡을 등록하면 해당 페이지만의 재생목록이 됩니다.

```yaml
playlist:
  - title: "곡 제목"
    scene: "사용된 장면 이름"
    file: "/assets/trpg/grea-grrr/01/audio/01-title.mp3"
  - title: "두 번째 곡"
    scene: "추격 장면"
    file: "/assets/trpg/grea-grrr/01/audio/02-chase.mp3"
```

GitHub Pages의 저장소 파일 크기 제한을 고려해 MP3 한 파일은 100MB 미만으로 유지하세요. 저작권상 배포 가능한 음원만 저장해야 합니다.
