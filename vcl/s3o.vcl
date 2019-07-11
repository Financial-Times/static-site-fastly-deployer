sub vcl_recv {
	declare local var.publicKey STRING;
	declare local var.isAuthenticated BOOL;
	declare local var.token STRING;
	declare local var.username STRING;
	declare local var.hostname STRING;
	declare local var.key STRING;

	set var.isAuthenticated = false;
	set var.publicKey = {"-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAuh0hlN3WBqVzC2lurGxL
fFlUYQCgR2UpV0k2i5czy9XUW0lhzT5e9/FOp6wPIOMoJpWHP8KwY/P5U0Z2qZUC
KmVhf2M61mvfvnUFEEqNAc35wNH15GZmjGnf1n6yTNPrM2cdCUeRzk49h2Ej4LBa
mA6GWZdl+ReYzOVqWiTQWHjjHy+Q/UrLk77Ra/drC+jj3rDkJz4qNXs9MldjYgud
Pt15pbLvqRk8VSXY36TinfJeySQQQAgNwvq49/qD145I+3DYrzCrDMIs8bHKy7IG
Ia1XW2YiSxn/9SwnwYt2PjhI3TuID7AyBt633Tsl3hfli/goBA5z0tBpkUB9uxLi
FgPdgNEUzxHCBPHD+C8pXi8XRQrn1uwpusrbjgOUZkRNhguVnyinTQPhZG0LbzaX
DbjSDIwwIjSVWkBhgT6LDbHvIlu0U6czVyA1OahqHLcwvA70wR2vXmwlbVKIcvGj
5wvk8v1BNxtv1MbiWHf0s6mJysd9Sy2b9gb5gpBjvlfUyw6BsIlDf9ysYXITiD4J
aXJGdlmupQMxdA0pGp4C6ROmupgzEgF+H/ycyBWtIUsl4L/Ceq4Sj0XBZ/QqumW1
76VUQTL5fKklfKw2fv4n1JrUssOz/xmcsRA/7BGiIsiSv/l/Mwt5qE8e+1u0jd8u
JKcKhmqPfXZTkK+jJR+d4fsCAwEAAQ==
-----END PUBLIC KEY-----"};

    if (req.method == "POST" && subfield(req.url.qs, "username", "&")) {
        declare local var.body STRING;

        set var.body = urldecode(req.postbody);
        set var.username = subfield(req.url.qs, "username", "&");
        set var.hostname = req.http.host;
        set var.token = subfield(var.body, "token", "&");
        set var.key = var.username "-" var.hostname;

        if (digest.rsa_verify(sha1, var.publicKey, var.key, var.token, standard)) {
            set var.isAuthenticated = true;
            set req.http.username = var.username;
            set req.http.token = var.token;
            error 902;
        } else {
            error 900;
        }
    } else if (req.http.Cookie:s3o_username && req.http.Cookie:s3o_token) {
        set var.username = req.http.Cookie:s3o_username;
        set var.hostname = req.http.host;
        set var.token = req.http.Cookie:s3o_token;
        set var.key = var.username "-" var.hostname;

        if (digest.rsa_verify(sha1, var.publicKey, var.key, var.token, standard)) {
            set var.isAuthenticated = true;
        }

        if (!var.isAuthenticated) {
            error 900;
        }
    } else {
        error 901;
    }
}

sub vcl_error {
	if (obj.status == 900){
        set obj.http.set-cookie = "s3o_username=; Max-Age=-1; HttpOnly; Secure; SameSite=Strict;";
		add obj.http.set-cookie = "s3o_token=; Max-Age=-1; HttpOnly; Secure; SameSite=Strict;";
		set obj.status = 403;

		if (req.http.Accept ~ "html") {
			set obj.http.content-type = "text/html; charset=utf-8";
			synthetic {"<h1>Authentication error.</h1><p>For access, log in with your FT account</p>"};
		} else {
			set obj.http.content-type = "application/json; charset=utf-8";
			synthetic {"
				{
					"errors":
					[
						{
							"message": "Authentication error. For access, log in with your FT account."
						}
					]
				}
			"};
		}
	}

	if (obj.status == 901){
		declare local var.protocol STRING;
		declare local var.originalLocation STRING;
		declare local var.s3o_url STRING;

		set var.protocol = if(req.is_ssl, "https", "http");
		set var.originalLocation = var.protocol "://" req.http.host req.url;
		set var.s3o_url = "https://s3o.ft.com/v2/authenticate?post=true&host=" urlencode(req.http.host) "&redirect=" urlencode(var.originalLocation);
		set obj.status = 302;
		set obj.http.cache-control = "private, no-cache, no-store, must-revalidate";
		set obj.http.pragma = "no-cache";
		set obj.http.expires = "0";
		set obj.http.location = var.s3o_url;

		synthetic {""};
	}

	if (obj.status == 902){
		set obj.http.set-cookie = "s3o_username=" req.http.username "; Max-Age=900000; HttpOnly; Secure; SameSite=Strict;";
		add obj.http.set-cookie = "s3o_token=" req.http.token "; Max-Age=900000; HttpOnly";
		set obj.status = 302;
		set obj.http.cache-control = "private, no-cache, no-store, must-revalidate";
		set obj.http.pragma = "no-cache";
		set obj.http.expires = "0";
		set obj.http.location = querystring.filter(req.url, "username" + querystring.filtersep() + "token");

		synthetic {""};
	}
}