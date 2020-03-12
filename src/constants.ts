/**
 * Regular expressions for friend codes.
 */
export const friendCodeRegExps = {
	bots: /([\d\w-]+\.){2}[\w-]+/gi,
	users: /(mfa\.)?[\-A-Za-z\d+/=_]{70,100}/gi
};
