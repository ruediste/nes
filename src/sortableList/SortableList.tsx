import type { Active, UniqueIdentifier } from "@dnd-kit/core";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";

import { DragHandle, SortableItem } from "./SortableItem";
import { SortableOverlay } from "./SortableOverlay";

interface BaseItem {
  id: UniqueIdentifier;
}

interface Props<T extends BaseItem> {
  items: T[][];
  onChange(items: T[][]): void;
  renderItem(args: {
    item: T;
    groupIndex: number;
    isDragPlaceholder: boolean;
    setNodeRef: (node: HTMLElement | null) => void;
    style: CSSProperties;
  }): JSX.Element;
  renderContainer(children: ReactNode, groupIndex: number): JSX.Element;
}

interface Data {
  groupIdx: number;
  itemIdx: number;
}
export function SortableList<T extends BaseItem>({
  items,
  onChange,
  renderItem,
  renderContainer,
}: Props<T>) {
  const [active, setActive] = useState<Active | null>(null);
  const activeItem = useMemo(
    () =>
      items
        .flatMap((v, groupIdx) =>
          v.map((x, itemIdx) => [groupIdx, itemIdx, x] as const)
        )
        .find((item) => item[2].id === active?.id),
    [active, items]
  );
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => {
        setActive(active);
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over?.id) {
          const activeData = active.data.current as Data;
          const overData = over.data.current as Data;

          if (activeData.groupIdx == overData.groupIdx) {
            onChange(
              items.map((group, idx) =>
                idx == activeData.groupIdx
                  ? arrayMove(group, activeData.itemIdx, overData.itemIdx)
                  : group
              )
            );
          } else {
            let newItems = [...items];
            const activeGroup = [...items[activeData.groupIdx]];
            const movedItem = activeGroup.splice(activeData.itemIdx, 1);
            newItems[activeData.groupIdx] = activeGroup;

            const overGroup = [...items[overData.groupIdx]];
            overGroup.splice(overData.itemIdx, 0, ...movedItem);
            newItems[overData.groupIdx] = overGroup;
            onChange(newItems);
          }
        }
        setActive(null);
      }}
      onDragOver={({ active, over }) => {
        const activeData = active.data.current as Data;
        const overData = over?.data.current as Data | null;
        console.log("onDragOver", activeData, overData);
      }}
      onDragCancel={() => {
        setActive(null);
      }}
    >
      {items.map((group, groupIdx) => (
        <SortableContext key={groupIdx} items={group}>
          {renderContainer(
            group.map((item, itemIdx) => (
              <SortableList.Item
                key={item.id}
                id={item.id}
                data={{ groupIdx, itemIdx }}
              >
                {(setNodeRef, style) =>
                  renderItem({
                    item,
                    groupIndex: groupIdx,
                    isDragPlaceholder: false,
                    setNodeRef,
                    style,
                  })
                }
              </SortableList.Item>
            )),
            groupIdx
          )}
        </SortableContext>
      ))}
      <SortableOverlay>
        {activeItem ? (
          <SortableList.Item
            id={activeItem[2].id}
            data={{ groupIdx: activeItem[0], itemIdx: activeItem[1] }}
          >
            {(setNodeRef, style) =>
              renderItem({
                item: activeItem[2],
                groupIndex: activeItem[0],
                isDragPlaceholder: true,
                setNodeRef,
                style,
              })
            }
          </SortableList.Item>
        ) : null}
      </SortableOverlay>
    </DndContext>
  );
}

SortableList.Item = SortableItem;
SortableList.DragHandle = DragHandle;
