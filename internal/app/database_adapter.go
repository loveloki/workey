package app

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// database 保留业务查询接口，同时让 PocketBase 负责连接池、读写分流和数据库生命周期。
type database struct {
	app core.App
}

func (d *database) Exec(query string, args ...any) (sql.Result, error) {
	q, err := boundQuery(d.app.DB(), query, args)
	if err != nil {
		return nil, err
	}
	return q.Execute()
}

func (d *database) Query(query string, args ...any) (*sql.Rows, error) {
	q, err := boundQuery(d.app.DB(), query, args)
	if err != nil {
		return nil, err
	}
	rows, err := q.Rows()
	if err != nil {
		return nil, err
	}
	return rows.Rows, nil
}

type databaseRow struct {
	query *dbx.Query
	err   error
}

func (r *databaseRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	return r.query.Row(dest...)
}

func (d *database) QueryRow(query string, args ...any) *databaseRow {
	q, err := boundQuery(d.app.DB(), query, args)
	return &databaseRow{query: q, err: err}
}

func (d *database) Begin() (*sql.Tx, error) {
	return d.BeginTx(context.Background())
}

func (d *database) BeginTx(ctx context.Context) (*sql.Tx, error) {
	// 原有同步快照模块接收 *sql.Tx，必须从 PocketBase 的单写连接池开启事务。
	pool, ok := d.app.NonconcurrentDB().(*dbx.DB)
	if !ok {
		return nil, fmt.Errorf("cannot start a business transaction inside a PocketBase transaction")
	}
	return pool.DB().BeginTx(ctx, nil)
}

func boundQuery(builder dbx.Builder, query string, args []any) (*dbx.Query, error) {
	var result strings.Builder
	params := make(dbx.Params, len(args))
	argument := 0
	var quote byte
	for i := 0; i < len(query); i++ {
		ch := query[i]
		if quote != 0 {
			result.WriteByte(ch)
			if ch == quote {
				if i+1 < len(query) && query[i+1] == quote {
					i++
					result.WriteByte(query[i])
				} else {
					quote = 0
				}
			}
			continue
		}
		switch ch {
		case '\'', '"', '`':
			quote = ch
			result.WriteByte(ch)
		case '?':
			if argument >= len(args) {
				return nil, fmt.Errorf("not enough query arguments")
			}
			name := fmt.Sprintf("p%d", argument)
			result.WriteString("{:" + name + "}")
			params[name] = args[argument]
			argument++
		default:
			result.WriteByte(ch)
		}
	}
	if argument != len(args) {
		return nil, fmt.Errorf("too many query arguments")
	}
	return builder.NewQuery(result.String()).Bind(params), nil
}
