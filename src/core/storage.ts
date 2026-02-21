import { GtfsData, AnalysisResult } from '../utils/gtfsUtils';

const DB_NAME = 'HeadwayDB';
const DB_VERSION = 1;

export const STORES = {
    GTFS: 'gtfs_data',
    ANALYSIS: 'analysis_results',
    PREFERENCES: 'user_preferences'
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

    // LocalStorage helpers for simpler small data
    setPreference(key: string, value: any): void {
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
