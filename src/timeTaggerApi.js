/**
 * TimeTagger API Service for Node.js
 * Based on: https://timetagger.readthedocs.io/en/latest/webapi/
 */

const API_BASE_URL = process.env.TIMETAGGER_URL || '';

class TimeTaggerApi {
  constructor() {
    this.apiToken = null;
  }

  setApiToken(token) {
    this.apiToken = token;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiToken) {
      headers['authtoken'] = this.apiToken;
    }
    return headers;
  }

  /**
   * Generate a unique key for a record
   * Format: 8 random hex chars
   */
  generateKey() {
    const chars = '0123456789abcdef';
    let key = '';
    for (let i = 0; i < 8; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
  }

  /**
   * Create a new time record
   * @param {string} description - Description with hashtag (e.g., "#coding")
   * @param {number} startTime - Unix timestamp in seconds
   * @param {number} endTime - Unix timestamp in seconds (same as startTime for running record)
   * @returns {Promise<object>} - The created record
   */
  async createRecord(description, startTime, endTime = startTime) {
    const record = {
      key: this.generateKey(),
      t1: Math.floor(startTime),
      t2: Math.floor(endTime),
      ds: description,
      mt: Math.floor(Date.now() / 1000),
      st: 0,
    };

    console.log(`[TimeTaggerApi] Creating record: ${description} at ${new Date(record.t1 * 1000).toISOString()}`);

    const response = await fetch(`${API_BASE_URL}/records`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify([record]),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create record: ${error}`);
    }

    const result = await response.json();
    console.log(`[TimeTaggerApi] Record created with key: ${record.key}`);
    return { ...record, result };
  }

  /**
   * Update an existing record (to set end time)
   * @param {object} record - The record to update
   * @returns {Promise<object>} - The updated record
   */
  async updateRecord(record) {
    const updatedRecord = {
      ...record,
      mt: Math.floor(Date.now() / 1000),
    };

    // Remove the result field if it exists
    delete updatedRecord.result;

    console.log(`[TimeTaggerApi] Updating record ${record.key}, setting t2=${record.t2}`);

    const response = await fetch(`${API_BASE_URL}/records`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify([updatedRecord]),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update record: ${error}`);
    }

    return await response.json();
  }

  /**
   * Get records within a time range
   * @param {number} startTime - Unix timestamp
   * @param {number} endTime - Unix timestamp
   * @returns {Promise<array>} - Array of records
   */
  async getRecords(startTime, endTime) {
    const response = await fetch(
      `${API_BASE_URL}/records?timerange=${startTime}-${endTime}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get records: ${error}`);
    }

    const data = await response.json();
    return data.records || [];
  }

  /**
   * Get the currently running record (t1 == t2 and recent)
   * @returns {Promise<object|null>} - The running record or null
   */
  async getRunningRecord() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const dayAgo = now - (24 * 60 * 60);
      
      const records = await this.getRecords(dayAgo, now);
      
      // Find a running record (t1 == t2 and recent)
      const hourAgo = now - (60 * 60);
      const runningRecord = records.find(r => 
        r.t1 === r.t2 && r.t1 > hourAgo
      );
      
      if (runningRecord) {
        console.log(`[TimeTaggerApi] Found running record: ${runningRecord.ds}`);
        return runningRecord;
      }
      
      return null;
    } catch (err) {
      console.error('[TimeTaggerApi] Error getting running record:', err);
      return null;
    }
  }

  /**
   * Start tracking a new activity
   * @param {string} facetName - The name of the facet/activity
   * @returns {Promise<object>} - The created record
   */
  async startTracking(facetName) {
    const description = facetName ? `#${facetName.replace(/\s+/g, '_').toLowerCase()}` : '#unknown';
    const startTime = Math.floor(Date.now() / 1000);
    
    // For a running record, t1 and t2 should be the same
    const result = await this.createRecord(description, startTime, startTime);
    
    return {
      key: result.key,
      t1: startTime,
      t2: startTime,
      ds: description,
    };
  }

  /**
   * Stop tracking (set end time on a record)
   * @param {object} record - The record to stop
   * @returns {Promise<object>} - The updated record
   */
  async stopTracking(record) {
    if (!record) return null;
    
    const stoppedRecord = {
      ...record,
      t2: Math.floor(Date.now() / 1000),
    };
    
    await this.updateRecord(stoppedRecord);
    
    const duration = stoppedRecord.t2 - stoppedRecord.t1;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    console.log(`[TimeTaggerApi] Stopped tracking ${record.ds} (duration: ${minutes}m ${seconds}s)`);
    
    return stoppedRecord;
  }
}

export const timeTaggerApi = new TimeTaggerApi();
export default timeTaggerApi;
