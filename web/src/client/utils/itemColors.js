// The colours a note or word can be given (saved on the account, the same in
// every notebook and on every device: api/user-settings.js item_colors).
//   tint  the pale background of a card / note
//   ink   a stronger shade for stripes and dots
export const ITEM_COLORS = [
    { key: 'yellow', label: 'Yellow', tint: '#FEF3C7', ink: '#F0B429' },
    { key: 'green', label: 'Green', tint: '#DCFCE7', ink: '#22C55E' },
    { key: 'blue', label: 'Blue', tint: '#DBEAFE', ink: '#3B82F6' },
    { key: 'pink', label: 'Pink', tint: '#FCE7F3', ink: '#EC4899' },
    { key: 'purple', label: 'Purple', tint: '#EDE9FE', ink: '#8B5CF6' },
];

export const colorKey = (item) => `${item.type}#${item.id}`;

/** The item's colour ({ key, label, tint, ink }), or null. */
export function colorOf(colors, item) {
    const key = colors && colors[colorKey(item)];
    return ITEM_COLORS.find((c) => c.key === key) || null;
}
