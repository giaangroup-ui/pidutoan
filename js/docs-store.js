/* Lưu tài liệu tham chiếu (PDF/ảnh) trong IndexedDB: store "files" giữ Blob, store "docs" giữ metadata + hiệu chỉnh + phép đo. */
(function (root) {
  const DB_NAME = "pidutoan-docs";
  const DB_VER = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
        if (!db.objectStoreNames.contains("docs")) {
          const s = db.createObjectStore("docs", { keyPath: "id" });
          s.createIndex("projectId", "projectId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function run(stores, mode, cb) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const req = cb(t);
      t.oncomplete = () => { db.close(); resolve(req && "result" in req ? req.result : undefined); };
      t.onerror = t.onabort = () => { db.close(); reject(t.error || new Error("IndexedDB lỗi")); };
    }));
  }

  function addDoc(meta, blob) {
    return run(["files", "docs"], "readwrite", (t) => {
      t.objectStore("files").put({ id: meta.id, blob });
      return t.objectStore("docs").put(meta);
    }).then(() => meta);
  }
  function updateDoc(meta) {
    return run(["docs"], "readwrite", (t) => t.objectStore("docs").put(meta));
  }
  function getDoc(id) {
    return run(["docs"], "readonly", (t) => t.objectStore("docs").get(id));
  }
  function getBlob(id) {
    return run(["files"], "readonly", (t) => t.objectStore("files").get(id)).then((r) => (r ? r.blob : null));
  }
  function listDocs(projectId) {
    return run(["docs"], "readonly", (t) => t.objectStore("docs").index("projectId").getAll(projectId))
      .then((rows) => (rows || []).sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "")));
  }
  function deleteDoc(id) {
    return run(["files", "docs"], "readwrite", (t) => {
      t.objectStore("files").delete(id);
      return t.objectStore("docs").delete(id);
    });
  }

  root.PiDocs = { addDoc, updateDoc, getDoc, getBlob, listDocs, deleteDoc };
})(typeof window !== "undefined" ? window : globalThis);
