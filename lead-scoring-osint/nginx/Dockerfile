FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built frontend files (will be provided by volume mount)
WORKDIR /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]