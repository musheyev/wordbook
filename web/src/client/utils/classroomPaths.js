// Addresses of the classroom pages (api/classrooms.js):
//   /classrooms                          My Classrooms
//   /classroom/<id>                      one classroom
//   /classroom/<id>/item/<item id>       one thing in it (a note, word, notebook)
export const MY_CLASSROOMS_PATH = '/classrooms';
export const classroomPath = (id) => `/classroom/${encodeURIComponent(id)}`;
export const classroomItemPath = (id, itemId) => `${classroomPath(id)}/item/${encodeURIComponent(itemId)}`;

/** Words for an item's type: "Note", "Word", "Wordbook", "Notebook". */
export const itemTypeLabel = (item) => (item.type === 'card' ? 'Note'
    : item.type === 'word' ? 'Word'
        : item.kind === 'wordbook' ? 'Wordbook' : 'Notebook');

/** The icon for an item's type (Semantic UI names). */
export const itemTypeIcon = (item) => (item.type === 'card' ? 'sticky note outline'
    : item.type === 'word' ? 'font'
        : item.kind === 'wordbook' ? 'book' : 'clone outline');
