# TLS Certificate Renewal

Certificates are renewed 30 days before expiry. The monitoring dashboard warns at 30 days and alerts at 14 days.

## Steps

1. Generate a new private key and certificate signing request (CSR) on the web server. Never reuse the old key.
2. Submit the CSR to the certificate authority and download the certificate with its full intermediate chain.
3. Check the chain with `openssl verify -CAfile chain.pem server.crt` before installing.
4. Install the certificate on every web server behind the load balancer, then reload (not restart) the web server.
5. Confirm from outside with `openssl s_client -connect example.gov.test:443 -servername example.gov.test` that the new expiry date is served.

## Payment gateway certificates

The payment gateway uses a separate client certificate for mutual TLS. Renew it with the gateway provider at
least two weeks ahead, because they must whitelist the new certificate before it works.
