import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import jobService from '../services/jobService';
import toast from 'react-hot-toast';
import {
  CloudArrowUpIcon,
  DocumentTextIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const UploadPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationErrors, setValidationErrors] = useState([]);

  const validateFile = (file) => {
    const errors = [];
    
    // Check file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx?|csv)$/i)) {
      errors.push('File must be Excel (.xlsx, .xls) or CSV format');
    }
    
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      errors.push('File size must be less than 10MB');
    }
    
    return errors;
  };

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      toast.error('Invalid file. Please upload an Excel or CSV file.');
      return;
    }

    const file = acceptedFiles[0];
    const errors = validateFile(file);
    
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    setFile(file);
    setValidationErrors([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv']
    },
    multiple: false
  });

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await jobService.uploadLeadsFile(file, (progress) => {
        setUploadProgress(Math.round(progress));
      });

      toast.success('File uploaded successfully!');
      
      // Navigate to status page with the new job ID
      navigate(`/status?jobId=${result.jobId}`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const removeFile = () => {
    setFile(null);
    setValidationErrors([]);
    setUploadProgress(0);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Upload Lead File
          </h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>Upload an Excel or CSV file containing your leads for OSINT enrichment.</p>
          </div>
          
          {/* File Requirements */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">File Requirements</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Excel (.xlsx, .xls) or CSV format</li>
                    <li>Must contain an 'email' column</li>
                    <li>Optional columns: name, company, phone, website</li>
                    <li>Maximum file size: 10MB</li>
                    <li>Maximum 5,000 leads per file</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div className="mt-5">
            {!file ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  {isDragActive
                    ? 'Drop the file here...'
                    : 'Drag and drop your file here, or click to browse'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Excel or CSV files only
                </p>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <DocumentTextIcon className="h-8 w-8 text-gray-400" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={removeFile}
                    disabled={uploading}
                    className="ml-4 text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Progress Bar */}
                {uploading && (
                  <div className="mt-4">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <XMarkIcon className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Please fix the following errors:
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <ul className="list-disc list-inside space-y-1">
                        {validationErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-5 flex justify-end space-x-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading || validationErrors.length > 0}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Start Processing'}
            </button>
          </div>
        </div>
      </div>

      {/* Sample File Download */}
      <div className="mt-6 bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Need a template?
          </h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>Download our sample Excel template with the correct format.</p>
          </div>
          <div className="mt-3">
            <button
              type="button"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <DocumentTextIcon className="-ml-1 mr-2 h-5 w-5 text-gray-400" />
              Download Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;