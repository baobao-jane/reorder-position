# reorder-position

숫자형 `sortPosition` 컬럼으로 목록 순서를 관리하는 유틸리티와 React 훅.

관리자 화면에서 배너·공지·팝업 같은 목록의 노출 순서를 바꿀 때, 전체 목록을 다시 번호 매기지 않고 **움직인 항목만** 이웃 값의 중간값으로 갱신합니다. 저장 시 서버로 보내는 데이터도 바뀐 항목뿐입니다.

- 이웃 사이 중간값 배치 (fractional indexing, 숫자 버전)
- 여러 항목 선택 이동: 맨 위 / 위 / 아래 / 맨 아래
- 정밀도 한계에 가까워지면 자동으로 전체 재정렬(rebalance)
- 드래그앤드롭 등 임의 순서 변경 시 최소 변경 계산 (`repositionOrdered`)
- 프레임워크 무관 core + React 훅(`reorder-position/react`)
- 의존성 없음

> 문자열 키 기반 [`fractional-indexing`](https://github.com/rocicorp/fractional-indexing)과 달리 DB의 기존 숫자(double) 컬럼을 그대로 씁니다.

## 설치

```bash
npm install reorder-position
```

## 동작 방식

기본은 `desc`(값이 클수록 위)입니다.

```
초기       a:2  b:1  c:0
c를 위로   a:2  c:1.5  b:1      → 저장 데이터 [{ id: "c", sortPosition: 1.5 }]
c를 맨 위로 c:3  a:2  b:1        → 저장 데이터 [{ id: "c", sortPosition: 3 }]
```

같은 틈에 계속 끼워 넣으면 간격이 절반씩 줄어듭니다. 이웃 간격이 `minGap`(기본 `1e-9`)보다 작아지거나 순서가 꼬이면, 그 이동에서만 전체를 `n-1 … 0`으로 다시 번호 매깁니다.

## React

```tsx
import { SortToolbar, useSortableList } from "reorder-position/react";
import "reorder-position/styles.css";

function BannerList({ banners }: { banners: Banner[] }) {
  const queryClient = useQueryClient();
  const list = useSortableList({
    initialItems: banners, // { id, sortPosition, ... }[]
    onSave: async (changes) => {
      await api.updateSortPositions(changes); // 바뀐 항목만
      await queryClient.invalidateQueries({ queryKey: ["banners"] });
    },
  });

  return (
    <>
      <SortToolbar
        canMoveUp={list.canMoveUp}
        canMoveDown={list.canMoveDown}
        onMove={list.move}
        onSave={() => void list.save()}
        canSave={list.isDirty}
        isSaving={list.isSaving}
      />
      {list.items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={list.isSelected(item.id)}
            onChange={() => list.toggleSelect(item.id)}
          />
          {item.title}
        </label>
      ))}
    </>
  );
}
```

### `useSortableList(options)`

| 옵션 | 설명 |
| --- | --- |
| `initialItems` | 서버 데이터. 저장 안 된 변경이 있는 동안은 무시하고, 저장·`reset` 후 다시 반영 |
| `onSave` | `(changes: { id, sortPosition }[]) => void \| Promise<void>` |
| `order`, `step`, `minGap`, `maxAbsPosition` | 아래 [옵션](#옵션) 참고 |

| 반환값 | 설명 |
| --- | --- |
| `items` | 표시 순서대로 정렬된 목록 |
| `changes`, `isDirty` | 마지막 저장 이후 바뀐 항목 |
| `move(direction)` | `"top" \| "up" \| "down" \| "bottom"`, 결과(`changed`, `rebalanced`) 반환 |
| `save()` | `onSave` 호출. 실패하면 reject 되고 변경은 유지됨. 저장 중 이동한 내용도 유지됨 |
| `reset()` | 로컬 변경을 버리고 최신 `initialItems` 표시 |
| `canMoveUp`, `canMoveDown` | 버튼 활성화용 |
| `selectedIds`, `isSelected`, `toggleSelect`, `setSelection`, `clearSelection` | 선택 상태. 사라진 id는 자동으로 빠짐 |

### `<SortToolbar />`

`canMoveUp`, `canMoveDown`, `onMove`, `onSave?`, `canSave?`, `isSaving?`, `labels?`, `className?`

```tsx
<SortToolbar
  {...props}
  labels={{ top: "맨 위로", up: "위로", down: "아래로", bottom: "맨 아래로", save: "저장", saving: "저장 중..." }}
/>
```

색상은 `.sp-toolbar`의 CSS 변수(`--sp-accent`, `--sp-border`, `--sp-radius` 등)로 바꿀 수 있습니다. 툴바를 쓰지 않고 훅만 사용해도 됩니다.

## Core (React 없이)

```ts
import { moveAndReposition, getPositionChanges, repositionOrdered } from "reorder-position";

// 버튼 이동
const result = moveAndReposition(items, new Set(["c"]), "up");
const changes = getPositionChanges(items, result.items);

// 드래그앤드롭: 새 순서 배열을 그대로 넘기면 최소한의 항목만 위치 변경
const dropped = repositionOrdered(reorderedItems);
```

| 함수 | 설명 |
| --- | --- |
| `moveAndReposition(items, selectedIds, direction, options?)` | 이동 + 위치 계산. `{ items, changed, rebalanced }` |
| `repositionOrdered(ordered, options?)` | 임의 순서에서 이미 올바른 순서인 최대 집합(LIS)은 유지, 나머지만 재배치 |
| `moveSelected(items, selectedIds, direction, order?)` | 위치값은 그대로 두고 순서만 변경 |
| `applyReorderedPositions(ordered, movedIds, options?)` | 지정한 항목만 재배치, 필요 시 rebalance |
| `getPositionChanges(before, after)` | 바뀐 `{ id, sortPosition }` 목록 |
| `sortByPosition(items, order?)` | 안정 정렬 |
| `canMoveUp` / `canMoveDown` | 선택 항목 이동 가능 여부 |
| `needsRebalance` / `rebalancePositions` | 정밀도 검사 / 전체 재번호 |

## 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `order` | `"desc"` | `desc`: 값이 클수록 위, `asc`: 작을수록 위 |
| `step` | `1` | 양 끝 바깥으로 보낼 때와 rebalance 시 간격 |
| `minGap` | `1e-9` | 이웃 간격이 이보다 작으면 rebalance |
| `maxAbsPosition` | 없음 | `number` 또는 `(count) => number`. 절댓값이 넘으면 rebalance (예: `(n) => n * 2`) |

## 개발

```bash
npm install
npm run dev        # example/ 데모 (Vite)
npm test           # vitest (core + hook)
npm run typecheck
npm run build      # dist/ (core, react 별도 엔트리)
```

## License

MIT
