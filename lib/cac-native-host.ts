// Native Messaging Host for CAC Certificate Operations
// This file defines the interface for the native Windows application
// that will handle actual CAC certificate operations

export interface NativeMessageRequest {
  action: 'connect' | 'getStatus' | 'readCertificates' | 'signData' | 'verifyPIN';
  data?: any;
}

export interface NativeMessageResponse {
  type: 'status' | 'certificates' | 'signature' | 'error';
  data: any;
}

// Native host manifest for Chrome/Edge
export const NATIVE_HOST_MANIFEST = {
  name: 'com.dod.aft.cac_reader',
  description: 'CAC Certificate Reader for AFT Application',
  path: 'aft_cac_reader.exe',
  type: 'stdio',
  allowed_origins: ['chrome-extension://EXTENSION_ID_HERE/'],
};

// PowerShell script template for Windows CAC operations
export const POWERSHELL_CAC_SCRIPT = `
# CAC Certificate Reader PowerShell Script
# Handles Windows Certificate Store operations for CAC cards

Add-Type -AssemblyName System.Security

function Get-CACCertificates {
    param()
    
    try {
        # Open the Personal certificate store for the current user
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
        
        # Get certificates that are likely from CAC cards
        $cacCertificates = @()
        
        foreach ($cert in $store.Certificates) {
            # Check if certificate is from DOD CA
            if ($cert.Issuer -match "DOD|DEPARTMENT OF DEFENSE") {
                # Check if certificate has private key
                if ($cert.HasPrivateKey) {
                    # Check key usage for digital signature
                    $keyUsage = $cert.Extensions | Where-Object { $_.Oid.FriendlyName -eq "Key Usage" }
                    if ($keyUsage -and $keyUsage.KeyUsages -match "DigitalSignature") {
                        $certInfo = @{
                            thumbprint = $cert.Thumbprint
                            subject = $cert.Subject
                            issuer = $cert.Issuer
                            validFrom = $cert.NotBefore
                            validTo = $cert.NotAfter
                            serialNumber = $cert.SerialNumber
                            hasPrivateKey = $cert.HasPrivateKey
                            certificateData = [Convert]::ToBase64String($cert.RawData)
                        }
                        $cacCertificates += $certInfo
                    }
                }
            }
        }
        
        $store.Close()
        return $cacCertificates
    }
    catch {
        Write-Error "Failed to read certificates: $_"
        return @()
    }
}

function Test-CACReaderStatus {
    param()
    
    try {
        # Check if any smart card readers are available
        $readers = Get-WmiObject -Class Win32_PnPEntity | Where-Object { 
            $_.Name -match "Smart Card|Card Reader" -and $_.Status -eq "OK" 
        }
        
        $status = @{
            isConnected = $true
            cardPresent = $false
            readerName = ""
            cardType = ""
        }
        
        if ($readers.Count -gt 0) {
            $status.readerName = $readers[0].Name
            
            # Try to detect if a card is present by checking for certificates
            $certs = Get-CACCertificates
            if ($certs.Count -gt 0) {
                $status.cardPresent = $true
                $status.cardType = "CAC"
                $status.certificates = $certs
            }
        }
        
        return $status
    }
    catch {
        return @{
            isConnected = $false
            error = "Failed to check CAC reader status: $_"
        }
    }
}

function Invoke-CACSign {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Data,
        
        [Parameter(Mandatory=$true)]
        [string]$CertificateThumbprint,
        
        [Parameter(Mandatory=$true)]
        [string]$Pin
    )
    
    try {
        # Find the certificate
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
        
        $cert = $store.Certificates | Where-Object { $_.Thumbprint -eq $CertificateThumbprint }
        
        if (-not $cert) {
            throw "Certificate not found with thumbprint: $CertificateThumbprint"
        }
        
        # Create RSA provider from certificate private key
        $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
        
        if (-not $rsa) {
            throw "Cannot access private key for certificate"
        }
        
        # Convert data to bytes
        $dataBytes = [System.Text.Encoding]::UTF8.GetBytes($Data)
        
        # Sign the data
        $signature = $rsa.SignData($dataBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
        
        $result = @{
            signature = [Convert]::ToBase64String($signature)
            certificate = @{
                thumbprint = $cert.Thumbprint
                subject = $cert.Subject
                issuer = $cert.Issuer
                validFrom = $cert.NotBefore
                validTo = $cert.NotAfter
                serialNumber = $cert.SerialNumber
                certificateData = [Convert]::ToBase64String($cert.RawData)
            }
            timestamp = Get-Date
            algorithm = "SHA256withRSA"
        }
        
        $store.Close()
        return $result
    }
    catch {
        $store.Close()
        throw "Failed to sign data: $_"
    }
}

# Main message processing loop for native messaging
function Start-NativeMessagingHost {
    while ($true) {
        try {
            # Read message from stdin
            $inputStream = [Console]::OpenStandardInput()
            $lengthBytes = New-Object byte[] 4
            $inputStream.Read($lengthBytes, 0, 4) | Out-Null
            
            $messageLength = [BitConverter]::ToInt32($lengthBytes, 0)
            
            if ($messageLength -le 0 -or $messageLength -gt 1024000) {
                break
            }
            
            $messageBytes = New-Object byte[] $messageLength
            $inputStream.Read($messageBytes, 0, $messageLength) | Out-Null
            
            $messageJson = [System.Text.Encoding]::UTF8.GetString($messageBytes)
            $message = ConvertFrom-Json $messageJson
            
            $response = @{}
            
            switch ($message.action) {
                "connect" {
                    $response = @{
                        type = "status"
                        data = @{
                            isConnected = $true
                            message = "Connected to CAC reader host"
                        }
                    }
                }
                "getStatus" {
                    $status = Test-CACReaderStatus
                    $response = @{
                        type = "status"
                        data = $status
                    }
                }
                "readCertificates" {
                    $certificates = Get-CACCertificates
                    $response = @{
                        type = "certificates"
                        data = @{
                            certificates = $certificates
                        }
                    }
                }
                "signData" {
                    try {
                        $result = Invoke-CACSign -Data $message.data.data -CertificateThumbprint $message.data.certificateThumbprint -Pin $message.data.pin
                        $response = @{
                            type = "signature"
                            data = $result
                        }
                    }
                    catch {
                        $response = @{
                            type = "error"
                            data = @{
                                message = $_.Exception.Message
                            }
                        }
                    }
                }
                "verifyPIN" {
                    # PIN verification is typically handled by the smart card middleware
                    # For now, we'll assume PIN is valid if we can access certificates
                    try {
                        $certs = Get-CACCertificates
                        $response = @{
                            type = "status"
                            data = @{
                                isConnected = $true
                                pinValid = $certs.Count -gt 0
                            }
                        }
                    }
                    catch {
                        $response = @{
                            type = "error"
                            data = @{
                                message = "PIN verification failed"
                            }
                        }
                    }
                }
                default {
                    $response = @{
                        type = "error"
                        data = @{
                            message = "Unknown action: $($message.action)"
                        }
                    }
                }
            }
            
            # Send response
            $responseJson = ConvertTo-Json $response -Depth 10
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($responseJson)
            $lengthBytes = [BitConverter]::GetBytes($responseBytes.Length)
            
            $outputStream = [Console]::OpenStandardOutput()
            $outputStream.Write($lengthBytes, 0, 4)
            $outputStream.Write($responseBytes, 0, $responseBytes.Length)
            $outputStream.Flush()
        }
        catch {
            # Exit on error
            break
        }
    }
}

# Start the native messaging host
Start-NativeMessagingHost
`;

// C# alternative for more robust implementation
export const CSHARP_CAC_HOST_TEMPLATE = `
using System;
using System.IO;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Linq;

namespace AFTCACReader
{
    public class CACCertificateInfo
    {
        public string thumbprint { get; set; }
        public string subject { get; set; }
        public string issuer { get; set; }
        public DateTime validFrom { get; set; }
        public DateTime validTo { get; set; }
        public string serialNumber { get; set; }
        public bool hasPrivateKey { get; set; }
        public string certificateData { get; set; }
    }

    public class NativeMessageRequest
    {
        public string action { get; set; }
        public dynamic data { get; set; }
    }

    public class NativeMessageResponse
    {
        public string type { get; set; }
        public dynamic data { get; set; }
    }

    class Program
    {
        static void Main(string[] args)
        {
            var host = new CACNativeHost();
            host.Start();
        }
    }

    public class CACNativeHost
    {
        public void Start()
        {
            while (true)
            {
                try
                {
                    var message = ReadMessage();
                    if (message == null) break;

                    var response = ProcessMessage(message);
                    WriteMessage(response);
                }
                catch
                {
                    break;
                }
            }
        }

        private NativeMessageRequest ReadMessage()
        {
            var stdin = Console.OpenStandardInput();
            
            var lengthBytes = new byte[4];
            stdin.Read(lengthBytes, 0, 4);
            
            var messageLength = BitConverter.ToInt32(lengthBytes, 0);
            
            if (messageLength <= 0 || messageLength > 1024000)
                return null;
            
            var messageBytes = new byte[messageLength];
            stdin.Read(messageBytes, 0, messageLength);
            
            var messageJson = Encoding.UTF8.GetString(messageBytes);
            return JsonConvert.DeserializeObject<NativeMessageRequest>(messageJson);
        }

        private void WriteMessage(NativeMessageResponse response)
        {
            var responseJson = JsonConvert.SerializeObject(response);
            var responseBytes = Encoding.UTF8.GetBytes(responseJson);
            var lengthBytes = BitConverter.GetBytes(responseBytes.Length);
            
            var stdout = Console.OpenStandardOutput();
            stdout.Write(lengthBytes, 0, 4);
            stdout.Write(responseBytes, 0, responseBytes.Length);
            stdout.Flush();
        }

        private NativeMessageResponse ProcessMessage(NativeMessageRequest message)
        {
            try
            {
                switch (message.action)
                {
                    case "connect":
                        return new NativeMessageResponse
                        {
                            type = "status",
                            data = new { isConnected = true, message = "Connected to CAC reader" }
                        };

                    case "getStatus":
                        return new NativeMessageResponse
                        {
                            type = "status",
                            data = GetCACStatus()
                        };

                    case "readCertificates":
                        return new NativeMessageResponse
                        {
                            type = "certificates",
                            data = new { certificates = GetCACCertificates() }
                        };

                    case "signData":
                        var signResult = SignData(
                            message.data.data.ToString(),
                            message.data.certificateThumbprint.ToString(),
                            message.data.pin.ToString()
                        );
                        return new NativeMessageResponse
                        {
                            type = "signature",
                            data = signResult
                        };

                    default:
                        return new NativeMessageResponse
                        {
                            type = "error",
                            data = new { message = $"Unknown action: {message.action}" }
                        };
                }
            }
            catch (Exception ex)
            {
                return new NativeMessageResponse
                {
                    type = "error",
                    data = new { message = ex.Message }
                };
            }
        }

        private dynamic GetCACStatus()
        {
            try
            {
                var certificates = GetCACCertificates();
                return new
                {
                    isConnected = true,
                    cardPresent = certificates.Count > 0,
                    readerName = "Windows Certificate Store",
                    cardType = "CAC",
                    certificates = certificates
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    isConnected = false,
                    cardPresent = false,
                    error = ex.Message
                };
            }
        }

        private List<CACCertificateInfo> GetCACCertificates()
        {
            var certificates = new List<CACCertificateInfo>();
            
            using (var store = new X509Store(StoreName.My, StoreLocation.CurrentUser))
            {
                store.Open(OpenFlags.ReadOnly);
                
                foreach (var cert in store.Certificates)
                {
                    // Check if certificate is from DOD
                    if (cert.Issuer.Contains("DOD") || cert.Issuer.Contains("DEPARTMENT OF DEFENSE"))
                    {
                        if (cert.HasPrivateKey)
                        {
                            // Check key usage for digital signature
                            var keyUsage = cert.Extensions.OfType<X509KeyUsageExtension>().FirstOrDefault();
                            if (keyUsage != null && keyUsage.KeyUsages.HasFlag(X509KeyUsageFlags.DigitalSignature))
                            {
                                certificates.Add(new CACCertificateInfo
                                {
                                    thumbprint = cert.Thumbprint,
                                    subject = cert.Subject,
                                    issuer = cert.Issuer,
                                    validFrom = cert.NotBefore,
                                    validTo = cert.NotAfter,
                                    serialNumber = cert.SerialNumber,
                                    hasPrivateKey = cert.HasPrivateKey,
                                    certificateData = Convert.ToBase64String(cert.RawData)
                                });
                            }
                        }
                    }
                }
            }
            
            return certificates;
        }

        private dynamic SignData(string data, string certificateThumbprint, string pin)
        {
            using (var store = new X509Store(StoreName.My, StoreLocation.CurrentUser))
            {
                store.Open(OpenFlags.ReadOnly);
                
                var cert = store.Certificates
                    .Cast<X509Certificate2>()
                    .FirstOrDefault(c => c.Thumbprint == certificateThumbprint);
                
                if (cert == null)
                    throw new Exception($"Certificate not found with thumbprint: {certificateThumbprint}");
                
                using (var rsa = cert.GetRSAPrivateKey())
                {
                    if (rsa == null)
                        throw new Exception("Cannot access private key for certificate");
                    
                    var dataBytes = Encoding.UTF8.GetBytes(data);
                    var signature = rsa.SignData(dataBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                    
                    return new
                    {
                        signature = Convert.ToBase64String(signature),
                        certificate = new
                        {
                            thumbprint = cert.Thumbprint,
                            subject = cert.Subject,
                            issuer = cert.Issuer,
                            validFrom = cert.NotBefore,
                            validTo = cert.NotAfter,
                            serialNumber = cert.SerialNumber,
                            certificateData = Convert.ToBase64String(cert.RawData)
                        },
                        timestamp = DateTime.Now,
                        algorithm = "SHA256withRSA"
                    };
                }
            }
        }
    }
}
`;

// Installation instructions
export const INSTALLATION_INSTRUCTIONS = `
# CAC Certificate Reader Native Host Installation

## Prerequisites
1. Windows 10/11 with .NET Framework 4.7.2 or later
2. Chrome or Edge browser
3. CAC card reader hardware
4. DOD certificates installed in Windows Certificate Store

## Installation Steps

### Option 1: PowerShell Implementation (Simpler)
1. Save the PowerShell script as 'aft_cac_reader.ps1'
2. Create a batch file 'aft_cac_reader.bat' with:
   \`\`\`batch
   @echo off
   powershell.exe -ExecutionPolicy Bypass -File "%~dp0aft_cac_reader.ps1"
   \`\`\`
3. Create the native messaging manifest file

### Option 2: C# Implementation (Recommended)
1. Create a new C# Console Application
2. Install Newtonsoft.Json NuGet package
3. Compile to 'aft_cac_reader.exe'
4. Create the native messaging manifest file

### Native Messaging Manifest
Create file 'com.dod.aft.cac_reader.json' in:
- Chrome: %LOCALAPPDATA%\\Google\\Chrome\\User Data\\NativeMessagingHosts\\
- Edge: %LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\NativeMessagingHosts\\

Content:
\`\`\`json
{
  "name": "com.dod.aft.cac_reader",
  "description": "CAC Certificate Reader for AFT Application",
  "path": "C:\\\\path\\\\to\\\\aft_cac_reader.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
\`\`\`

### Registry Registration (if needed)
Add registry key:
HKEY_CURRENT_USER\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.dod.aft.cac_reader
Value: Path to manifest file
`;
