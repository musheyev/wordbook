import React from 'react';
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
    SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// A vertical list whose rows can be dragged into a new order, built on
// dnd-kit. Used for a notebook's items (NotebookItemList on phones, WordList
// in the desktop rail).
//
// How dnd-kit fits together
// -------------------------
//   DndContext       watches pointer/keyboard input and runs a drag
//   SortableContext  knows the list's order (the ids, top to bottom)
//   useSortable      called once per row: gives the row a ref, the
//                    `transform` that slides it out of the way while another
//                    row is dragged past, and the event listeners that start
//                    a drag
// When the user drops a row, onDragEnd reports which row moved and which row
// it was dropped on; arrayMove builds the reordered array from that.
//
// Drag handle
// -----------
// Only a small grip (⋮⋮) starts a drag, not the whole row. The row itself is
// still a link to open the item, and on phones a swipe on the row must still
// scroll the page. So renderItem receives `handleProps` to spread onto
// whatever element should act as the grip.
//
// Props:
//   items       the list, top to bottom
//   getKey      item -> unique string id
//   onReorder   (newItems) => void, called once per completed drag
//   renderItem  (item, handleProps, isDragging) => the row's contents
//   className   class for the list element (a <ul>)

export default function SortableList({ items, getKey, onReorder, renderItem, className }) {
    // Sensors decide what input starts a drag.
    //   PointerSensor: mouse, pen and touch. The 4px distance means a tap on
    //     the grip is still a tap; the drag starts only once it moves.
    //   KeyboardSensor: focus the grip, press Space to pick up, arrow keys to
    //     move, Space to drop, Escape to cancel — so reordering works without
    //     a mouse (accessibility).
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const ids = items.map(getKey);

    const onDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return; // dropped in place or outside
        const from = ids.indexOf(active.id);
        const to = ids.indexOf(over.id);
        onReorder(arrayMove(items, from, to));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className={className}>
                    {items.map((item) => (
                        <SortableRow key={getKey(item)} id={getKey(item)}>
                            {(handleProps, isDragging) => renderItem(item, handleProps, isDragging)}
                        </SortableRow>
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    );
}

// One row. `children` is a function so the row can hand the grip's props to
// whatever renderItem draws.
function SortableRow({ id, children }) {
    const {
        attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
    } = useSortable({ id });

    const style = {
        // Rows only move up and down: drop any sideways movement.
        transform: CSS.Transform.toString(transform && { ...transform, x: 0 }),
        transition,
        position: 'relative',
        zIndex: isDragging ? 2 : undefined,
    };

    // Everything the grip needs: the ref dnd-kit uses to find the "activator",
    // ARIA attributes (role, aria-describedby with usage instructions for
    // screen readers), and the pointer/keyboard listeners that start a drag.
    const handleProps = { ref: setActivatorNodeRef, ...attributes, ...listeners };

    return (
        <li ref={setNodeRef} style={style} className={isDragging ? 'sortable-row sortable-row--dragging' : 'sortable-row'}>
            {children(handleProps, isDragging)}
        </li>
    );
}
