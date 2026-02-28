import { GtfsData, AnalysisResult } from '../types/gtfs';

const DB_NAME = 'HeadwayDB';
const DB_VERSION = 4;

export const STORES = {
    GTFS: 'gtfs_data',
    ANALYSIS: 'analysis_results',
    PREFERENCES: 'user_preferences',
    SPACING: 'spacing_diagnostic',
    RAW_DEPARTURES: 'raw_departures',
    CRITERIA: 'analysis_criteria',
    CATALOG: 'route_catalog',
    FEEDS: 'feed_meta',
};

class StorageService {
    private db: IDBDatabase | null = null;

    async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORES.GTFS)) {
                    db.createObjectStore(STORES.GTFS);
                }
                if (!db.objectStoreNames.contains(STORES.ANALYSIS)) {
                    db.createObjectStore(STORES.ANALYSIS);
                }
                if (!db.objectStoreNames.contains(STORES.PREFERENCES)) {
                    db.createObjectStore(STORES.PREFERENCES);
                }
                if (!db.objectStoreNames.contains(STORES.SPACING)) {
                    db.createObjectStore(STORES.SPACING);
                }
                if (!db.objectStoreNames.contains(STORES.RAW_DEPARTURES)) {
                    db.createObjectStore(STORES.RAW_DEPARTURES);
                }
                if (!db.objectStoreNames.contains(STORES.CRITERIA)) {
                    db.createObjectStore(STORES.CRITERIA);
                }
                if (!db.objectStoreNames.contains(STORES.CATALOG)) {
                    db.createObjectStore(STORES.CATALOG);
                }
                if (!db.objectStoreNames.contains(STORES.FEEDS)) {
                    db.createObjectStore(STORES.FEEDS);
                }
            };
        });
    }

    async setItem<T>(storeName: string, key: string, value: T): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getItem<T>(storeName: string, key: string): Promise<T | null> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteItem(storeName: string, key: string): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearStore(storeName: string): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAllItems<T>(storeName: string): Promise<T[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async putItems<T>(storeName: string, items: { key: string; value: T }[]): Promise<void> {
        if (items.length === 0) return;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            for (const item of items) {
                store.put(item.value, item.key);
            }

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // LocalStorage helpers for simpler small data
    setPreference(key: string, value: unknown): void {
        localStorage.setItem(`headway_pref_${key}`, JSON.stringify(value));
    }

    getPreference<T>(key: string): T | null {
        const item = localStorage.getItem(`headway_pref_${key}`);
        if (!item) return null;
        try {
            return JSON.parse(item) as T;
        } catch {
            return null;
        }
    }
}

export const storage = new StorageService();
