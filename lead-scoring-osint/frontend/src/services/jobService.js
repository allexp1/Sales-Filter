import apiService from './apiService';

class JobService {
  async getJobs() {
    return apiService.getJobs();
  }

  async getJob(jobId) {
    return apiService.getJob(jobId);
  }

  async getStats() {
    return apiService.getJobStats();
  }

  async downloadJob(jobId) {
    const blob = await apiService.downloadJob(jobId);
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enriched_leads_${jobId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async uploadFile(file) {
    return apiService.uploadFile(file);
  }

  async downloadTemplate() {
    const blob = await apiService.downloadTemplate();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lead_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export default new JobService();