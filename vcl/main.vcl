sub vcl_recv {
    if (table.lookup(routes, req.url.path)) {
        error 200 "OK";
    } else {
        # If url path does not end in an extension, let's add /index.html to the end and see if that path exists.
        if (std.strlen(req.url.ext) == 0) {
            if (std.strlen(req.url.basename) == 0) {
                if (std.suffixof(req.url.dirname, "/")) {
                    set req.url = req.url.dirname "index.html";
                } else {
                    set req.url = req.url.dirname "/index.html";
                }
            } else {
                set req.url = req.url.path "/index.html";
            }
        }
        if (table.lookup(routes, req.url.path)) {
            error 200 "OK";
        } else {
            error 404 "NOT FOUND";
        }
    }
}

sub vcl_error {
    if (obj.status == 200) {
        set obj.http.content-type = table.lookup(contentType, req.url.path);
        synthetic table.lookup(routes, req.url.path);

        // When using vcl_error for a synthetic response, Varnish adds a Retry-After header to the response that isn't correct.
        unset obj.http.Retry-After;

        return (deliver);
    }
}