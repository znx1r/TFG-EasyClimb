# Next steps (student)

1. Read [`PLANNING.md`](PLANNING.md) and [`RELATED_WORK.md`](RELATED_WORK.md).
2. Keep `make test` green; clear `TODO(m2)`…`TODO(m5)` as you implement.
3. Prefer extending `src/engine/` before growing `web/` features.
4. For M2: start with an **adapter interface** (image → list[Hold]) even if the first detector is stubbed.

```bash
rg 'TODO\(m[2-5]\)' tests/ docs/ src/ || true
```
