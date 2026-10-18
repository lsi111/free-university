# 6단계 학사 과정 작업 진행 기록

## 완료 (Phase 1)
- schema.js(stage 2~6, 앞선 단계 갈래 opensAfter), progress.js(stageSummary, isAvailable, lessonOrder, STAGE_NAMES, majorDone, bachelorDone), department/lesson/progress 화면, search.js 라벨, styles.css(.stage-steps 등), tests 3개 추가, check.mjs "6단계 학사 과정 구성" 절, tools/merge-stages.mjs(formula 자동 판정), AUTHORING.md 절 추가.

## 작업 방식
- 원고(이전 세션 임시 폴더에 있었음, 커밋 대상 아님): stages/<id>.mjs (r`` 문자열, F() 그림 헬퍼). 백틱 금지, 수식 안 '·' 금지(KaTeX \cdotp 오류).
- 그림: tools/svgkit.py (Fig, Axes, resistor, battery) → content/departments/<id>/*.svg. 갤러리: http://localhost:8123/_gallery.html#경로,경로 (갤러리 파일은 커밋 전 삭제함, 필요 시 다시 만듦).
- 병합·검사: node tools/merge-stages.mjs <id> <조각.mjs> → node tools/validate-dept.mjs <id> → npm run check. 이미 합친 학과를 다시 합치면 version이 한 번 더 오르므로 새 학과에만 쓴다.
- 다음 차례: civil-eng (계획: 트러스 절점법·좌굴·RC / 흙의 삼상·유효응력·전단강도 / 관수로·매닝·합리식 / 교량·터널·생애주기 / 캡스톤).
- numeric tolerance는 반드시 1 미만(오답 = 정답+1이 통과하면 안 됨).
- heredoc 파이썬에 '·' 등 특수문자 쓰면 깨짐 → Edit 도구 사용.

## 완료 학과 (30/51)
- 자연 (7): mathematics, physics, chemistry, statistics, life-science, earth-science, astronomy
- 경영 (5): business-administration, finance, accounting, international-trade, marketing
- 공학 (9): computer-science, electrical-eng, mechanical-eng, industrial-eng, materials-eng, architecture, civil-eng, chemical-eng, environmental-eng
- 교육 (4): education-studies, subject-education, early-childhood-ed, special-education
- 예술·체육 (5): design-studies, fine-arts, theater-film, music-studies, sport-science

## 남은 학과 (21/51)
- 인문 (9): korean-lit, german-lit, history-studies, linguistics, english-lit, japanese-lit, chinese-lit, philosophy, french-lit
- 사회 (12): economics, library-science, media-communication, law-studies, health-administration, social-welfare, sociology, psychology, anthropology, political-science, geography, public-administration

## 마무리 할 일
- catalog.json limits: accounting(감사·세무 개념 포함으로 문구 조정), marketing(통계 분석→A/B·CLV 단순 계산 포함) 등 확인. audience/summary에 '12교시' 등 옛 표현 있는지 grep.
- README.md 현재 상태 문단(1,020교시, 6단계) 갱신, 구조 설명의 progress.js 설명 갱신.
- docs/BACHELOR_6STAGE_PLAN.md 그대로 커밋 대상.
- _gallery.html 삭제, npm test / npm run check 최종 통과.
- 커밋은 사용자 확인 후.
