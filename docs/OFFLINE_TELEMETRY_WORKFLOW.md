# Offline Telemetry Workflow

Muc tieu: user chi can dung file `exe`, khong can chay lenh nao de export.  
Ban se nhan thu muc du lieu tu user, gom vao mot cho, roi chay 1 lenh de phan tich va de xuat dieu chinh cong thuc.

## 1. Tren may user (chi copy thu muc)

Khi user chay app `exe`, du lieu scan tu dong duoc ghi vao:

- `data/telemetry/live/pattern_events.jsonl`
- `data/telemetry/live/pattern_outcomes.jsonl` (neu da resolve)

Voi ban dong goi `exe`, cac file nay nam cung cap voi `exe`:

- `<thu_muc_exe>/data/telemetry/...`

User khong can chay lenh. Chi can gui cho ban thu muc:

- `data/telemetry` (khuyen nghi), hoac
- it nhat `data/telemetry/live`

## 2. Tren may ban (gom folder dump)

Ban tao mot thu muc chung, vi du:

- `D:/collected-telemetry/`

Moi user mot thu muc con, vi du:

- `D:/collected-telemetry/userA/data/telemetry/live/...`
- `D:/collected-telemetry/userB/data/telemetry/live/...`

## 3. Chay 1 lenh duy nhat

```bash
pnpm run telemetry:adjust -- --input-dir="D:/collected-telemetry"
```

Lenh nay se tu dong:

1. Quet de quy, tim tat ca `pattern_events.jsonl` (raw dump user gui)
2. Neu co `pattern_outcomes.jsonl` cung cap, se merge outcome
3. Ingest + dedupe vao kho tong hop
4. Tao report hieu nang pattern
5. Tao file de xuat dieu chinh rules

## 4. File output sau khi chay

- Kho du lieu tong hop: `data/telemetry/warehouse/events.jsonl`
- Report JSON: `artifacts/pattern-performance-report.json`
- Report Markdown: `artifacts/pattern-performance-report.md`
- Rule candidate:
  `artifacts/proposed_rules/infinityalgo_candlestick_patterns_rules_vi.candidate.json`
- Rule suggestions:
  `artifacts/proposed_rules/rule_adjustment_suggestions.json`
  `artifacts/proposed_rules/rule_adjustment_suggestions.md`

## 5. Ghi chu

- Khong can user export bang lenh `telemetry:export`.
- Neu ban van co file export `.json`, script ingest van doc duoc.
- He thong dedupe theo `eventId`, nen co the ingest lai nhieu lan ma khong bi nhan ban.
